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
from app.core.database import engine, Base
from app.core.security import limiter, security_headers_middleware
from app.routers import (
    productos, movimientos, proyecciones,
    alertas, auth, reportes, scanner, proveedores, usuarios, ventas,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("main")

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
IS_PROD = ENVIRONMENT == "production"


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Iniciando InvSystem Pro [%s]", ENVIRONMENT)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
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

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:80,http://localhost",
).split(",")

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


@app.get("/health")
async def health():
    return {"status": "ok", "environment": ENVIRONMENT, "version": "1.1.0"}
