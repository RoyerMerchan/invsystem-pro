"""
Router: /api/v1/scanner
Endpoints para el módulo de escáner QR / código de barras.

Endpoints:
  GET  /buscar?q=          Busca producto por SKU o nombre
  POST /movimiento         Registra entrada/salida por SKU
  GET  /qr/{producto_id}   Genera imagen QR en base64
  GET  /historial          Últimos N movimientos registrados
  POST /qr/batch           Genera QR para múltiples productos
"""
import base64
import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, or_, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Producto, Movimiento, Usuario
from app.routers.auth import get_current_user

router = APIRouter()


# ── Schemas ─────────────────────────────────────────────────────
class MovimientoScannerRequest(BaseModel):
    sku: str = Field(..., min_length=1, max_length=50)
    tipo: str = Field(..., pattern="^(entrada|salida)$")
    cantidad: int = Field(..., gt=0, le=9999)
    motivo: str = Field(default="", max_length=200)


class MovimientoScannerResponse(BaseModel):
    ok: bool
    mensaje: str
    producto: str
    sku: str
    tipo: str
    cantidad: int
    stock_anterior: int
    stock_nuevo: int


# ── Helper: estado del producto ──────────────────────────────────
def _estado(p: Producto) -> str:
    if p.stock_actual == 0:
        return "sin_stock"
    if p.stock_actual < p.stock_minimo:
        return "stock_bajo"
    return "normal"


def _producto_dict(p: Producto) -> dict:
    return {
        "id": p.id,
        "nombre": p.nombre,
        "sku": p.sku,
        "categoria": p.categoria,
        "stock_actual": p.stock_actual,
        "stock_minimo": p.stock_minimo,
        "precio_unitario": p.precio_unitario,
        "unidad_medida": p.unidad_medida,
        "estado": _estado(p),
    }


# ── GET /buscar ──────────────────────────────────────────────────
@router.get("/buscar", summary="Buscar producto por SKU o nombre")
async def buscar_producto(
    q: str = Query(..., min_length=1, description="SKU o nombre del producto"),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Busca un producto por SKU exacto primero, luego por nombre parcial.
    Retorna lista para ser compatible con cualquier tipo de búsqueda.
    """
    q = q.strip().upper()

    # 1. Buscar por SKU exacto (insensible a mayúsculas/espacios para tolerar
    #    SKU antiguos que se guardaron sin normalizar). .first() evita fallar
    #    si existieran duplicados legados que normalizan al mismo valor.
    stmt_sku = select(Producto).where(func.upper(func.trim(Producto.sku)) == q)
    res_sku = await db.execute(stmt_sku)
    exacto = res_sku.scalars().first()
    if exacto:
        return [_producto_dict(exacto)]

    # 2. Buscar por SKU parcial o nombre
    stmt = select(Producto).where(
        or_(
            Producto.sku.ilike(f"%{q}%"),
            Producto.nombre.ilike(f"%{q.lower()}%"),
        )
    ).limit(5)
    res = await db.execute(stmt)
    productos = res.scalars().all()

    if not productos:
        raise HTTPException(
            status_code=404,
            detail=f"No se encontró ningún producto con SKU o nombre '{q}'"
        )

    return [_producto_dict(p) for p in productos]


# ── POST /movimiento ─────────────────────────────────────────────
@router.post("/movimiento", response_model=MovimientoScannerResponse,
             summary="Registrar entrada/salida por SKU")
async def registrar_movimiento_scanner(
    data: MovimientoScannerRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Registra un movimiento de inventario usando el SKU del producto."""
    if current_user.rol == "consulta":
        raise HTTPException(403, detail="Los invitados no pueden registrar movimientos.")
    # Buscar producto por SKU (insensible a mayúsculas/espacios)
    res = await db.execute(
        select(Producto).where(func.upper(func.trim(Producto.sku)) == data.sku.strip().upper())
    )
    producto = res.scalars().first()
    if not producto:
        raise HTTPException(
            status_code=404,
            detail=f"Producto con SKU '{data.sku}' no encontrado"
        )

    stock_anterior = producto.stock_actual

    # Validar stock suficiente para salida
    if data.tipo == "salida" and producto.stock_actual < data.cantidad:
        raise HTTPException(
            status_code=400,
            detail=f"Stock insuficiente. Disponible: {producto.stock_actual} {producto.unidad_medida}(s)"
        )

    # Aplicar movimiento
    if data.tipo == "entrada":
        producto.stock_actual += data.cantidad
    else:
        producto.stock_actual -= data.cantidad

    # Registrar en historial
    movimiento = Movimiento(
        producto_id=producto.id,
        tipo=data.tipo,
        cantidad=data.cantidad,
        stock_resultante=producto.stock_actual,
        motivo=data.motivo or f"Registrado por escáner",
        fecha=datetime.utcnow(),
    )
    db.add(movimiento)
    await db.flush()

    signo = "+" if data.tipo == "entrada" else "-"
    return MovimientoScannerResponse(
        ok=True,
        mensaje=f"{signo}{data.cantidad} {producto.unidad_medida}(s) de '{producto.nombre}' registrado",
        producto=producto.nombre,
        sku=producto.sku,
        tipo=data.tipo,
        cantidad=data.cantidad,
        stock_anterior=stock_anterior,
        stock_nuevo=producto.stock_actual,
    )


# ── GET /historial ───────────────────────────────────────────────
@router.get("/historial", summary="Últimos movimientos del escáner")
async def historial_scanner(
    limit: int = Query(default=15, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Retorna los últimos N movimientos con nombre y SKU del producto."""
    stmt = (
        select(Movimiento, Producto.nombre.label("prod_nombre"), Producto.sku.label("prod_sku"))
        .join(Producto, Movimiento.producto_id == Producto.id)
        .order_by(desc(Movimiento.fecha))
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()

    return [
        {
            "id": row.Movimiento.id,
            "fecha": str(row.Movimiento.fecha)[:19],
            "producto": row.prod_nombre,
            "sku": row.prod_sku,
            "tipo": row.Movimiento.tipo,
            "cantidad": row.Movimiento.cantidad,
            "stock_resultante": row.Movimiento.stock_resultante,
            "motivo": row.Movimiento.motivo,
        }
        for row in rows
    ]


# ── GET /qr/{producto_id} ────────────────────────────────────────
@router.get("/qr/{producto_id}", summary="Generar código QR de un producto")
async def generar_qr(
    producto_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """
    Genera una imagen QR en base64 con el SKU del producto.
    El QR contiene el SKU para que el escáner lo reconozca al instante.
    """
    producto = await db.get(Producto, producto_id)
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    try:
        import qrcode
        from qrcode.image.pure import PyPNGImage

        qr = qrcode.QRCode(
            version=2,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=8,
            border=3,
        )
        qr.add_data(producto.sku)
        qr.make(fit=True)

        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        img_b64 = base64.b64encode(buf.getvalue()).decode()

    except Exception as e:
        # Fallback si Pillow no está disponible: retorna sin imagen
        img_b64 = ""

    return {
        "producto_id": producto_id,
        "nombre": producto.nombre,
        "sku": producto.sku,
        "categoria": producto.categoria,
        "stock_actual": producto.stock_actual,
        "qr_base64": img_b64,
    }


# ── POST /qr/batch ───────────────────────────────────────────────
@router.post("/qr/batch", summary="Generar QR para múltiples productos")
async def generar_qr_batch(
    ids: list[int],
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    """Genera QR para una lista de IDs. Máximo 20 productos por llamada."""
    if len(ids) > 20:
        raise HTTPException(status_code=400, detail="Máximo 20 productos por lote")

    resultados = []
    for pid in ids:
        producto = await db.get(Producto, pid)
        if producto:
            resultados.append({
                "producto_id": pid,
                "nombre": producto.nombre,
                "sku": producto.sku,
            })
    return resultados
