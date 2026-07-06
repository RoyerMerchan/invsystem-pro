"""InvSystem Pro — API Principal v1.1"""
import os
import logging
import traceback
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from app.core.database import engine, Base, AsyncSessionLocal
from app.core.security import limiter, security_headers_middleware
from app.routers import (
    productos, movimientos, proyecciones,
    alertas, auth, reportes, scanner, proveedores, usuarios, ventas, catalogo,
    tipos_control,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("main")

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
IS_PROD = ENVIRONMENT == "production"


DEFAULTS_CATALOGO = {
    "categoria": ["Electrónica", "Ropa", "Alimentos", "Herramientas", "Otros"],
    "unidad": ["unidad", "caja", "paquete", "kg", "litro"],
    "sede": ["Sede Centro", "Sede Norte"],
}


async def _seed_catalogo() -> None:
    """Siembra las opciones por defecto solo si la tabla está vacía."""
    from sqlalchemy import select, func
    from app.models.models import OpcionCatalogo

    async with AsyncSessionLocal() as db:
        total = await db.scalar(select(func.count()).select_from(OpcionCatalogo))
        if total and total > 0:
            return
        for tipo, valores in DEFAULTS_CATALOGO.items():
            for valor in valores:
                db.add(OpcionCatalogo(tipo=tipo, valor=valor, activo=True))
        await db.commit()
        logger.info("Catálogo sembrado con valores por defecto")


async def _migrar_columnas_producto() -> None:
    """Agrega columnas nuevas a `productos` sin Alembic.

    `create_all` no altera tablas existentes, así que en Postgres añadimos
    las columnas de forma idempotente (ADD COLUMN IF NOT EXISTS).
    """
    from sqlalchemy import text

    sentencias = [
        "ALTER TABLE productos ADD COLUMN IF NOT EXISTS tipo_control_id INTEGER",
        "ALTER TABLE productos ADD COLUMN IF NOT EXISTS caracteristicas JSON DEFAULT '{}'::json",
    ]
    try:
        async with engine.begin() as conn:
            for sql in sentencias:
                await conn.execute(text(sql))
        logger.info("Migración de columnas de producto aplicada")
    except Exception as e:  # p. ej. SQLite en local no soporta la sintaxis
        logger.warning("No se pudo aplicar la migración de columnas: %s", e)


async def _normalizar_skus() -> None:
    """Normaliza los SKU existentes a MAYÚSCULAS sin espacios, para que el
    escáner y el kiosko (que buscan en mayúsculas) encuentren los productos.

    Idempotente: solo toca filas que aún no están normalizadas y que no
    generarían un choque con el índice único `sku`. Las que colisionarían se
    dejan intactas y se reportan para resolución manual.
    """
    from sqlalchemy import text

    sql = text(
        """
        UPDATE productos AS p
        SET sku = UPPER(TRIM(p.sku))
        WHERE p.sku <> UPPER(TRIM(p.sku))
          AND NOT EXISTS (
              SELECT 1 FROM productos AS o
              WHERE o.id <> p.id
                AND UPPER(TRIM(o.sku)) = UPPER(TRIM(p.sku))
          )
        """
    )
    try:
        async with engine.begin() as conn:
            result = await conn.execute(sql)
        if result.rowcount:
            logger.info("SKU normalizados: %s producto(s) actualizados", result.rowcount)
    except Exception as e:  # p. ej. sintaxis no soportada en SQLite local
        logger.warning("No se pudo normalizar los SKU existentes: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Iniciando InvSystem Pro [%s]", ENVIRONMENT)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _migrar_columnas_producto()
    await _normalizar_skus()
    await _seed_catalogo()
    yield
    await engine.dispose()


app = FastAPI(
    title="InvSystem Pro API",
    version="1.1.0",
    lifespan=lifespan,
    docs_url=None if IS_PROD else "/docs",
    redoc_url=None if IS_PROD else "/redoc",
    openapi_url=None if IS_PROD else "/openapi.json",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

ALLOWED_ORIGINS = [
    o.strip().rstrip("/")
    for o in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://localhost:80,http://localhost",
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=600,
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    return await security_headers_middleware(request, call_next)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    logger.error("Error: %s | path=%s | %s", exc, request.url.path, tb)
    if IS_PROD:
        return JSONResponse(
            status_code=500,
            content={"detail": "Error interno del servidor"},
        )
    return JSONResponse(status_code=500, content={"detail": str(exc)})


app.include_router(auth.router,         prefix="/api/v1/auth",         tags=["Auth"])
app.include_router(productos.router,    prefix="/api/v1/productos",    tags=["Productos"])
app.include_router(movimientos.router,  prefix="/api/v1/movimientos",  tags=["Movimientos"])
app.include_router(proveedores.router,  prefix="/api/v1/proveedores",  tags=["Proveedores"])
app.include_router(proyecciones.router, prefix="/api/v1/proyecciones", tags=["Proyecciones"])
app.include_router(alertas.router,      prefix="/api/v1/alertas",      tags=["Alertas"])
app.include_router(reportes.router,     prefix="/api/v1/reportes",     tags=["Reportes"])
app.include_router(usuarios.router,     prefix="/api/v1/usuarios",     tags=["Usuarios"])
app.include_router(scanner.router,      prefix="/api/v1/scanner",      tags=["Scanner"])
app.include_router(ventas.router,       prefix="/api/v1/ventas",       tags=["Ventas"])
app.include_router(catalogo.router,     prefix="/api/v1/catalogo",     tags=["Catalogo"])
app.include_router(tipos_control.router, prefix="/api/v1/tipos-control", tags=["TiposControl"])


@app.get("/health")
async def health():
    return {"status": "ok", "environment": ENVIRONMENT, "version": "1.1.0"}
