"""Router: /api/v1/movimientos — invitados no pueden registrar movimientos"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Producto, Movimiento, Usuario
from app.routers.auth import get_current_user
from app.schemas import MovimientoCreate, MovimientoResponse

router = APIRouter()


@router.post("/", response_model=MovimientoResponse, status_code=201)
async def registrar_movimiento(
    data: MovimientoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if current_user.rol == "consulta":
        raise HTTPException(403, detail="Los invitados no pueden registrar movimientos.")
    producto = await db.get(Producto, data.producto_id)
    if not producto:
        raise HTTPException(404, detail="Producto no encontrado")
    if data.tipo == "salida" and producto.stock_actual < data.cantidad:
        raise HTTPException(400, detail=f"Stock insuficiente. Disponible: {producto.stock_actual}")
    if data.tipo == "entrada":
        producto.stock_actual += data.cantidad
    elif data.tipo == "salida":
        producto.stock_actual -= data.cantidad
    elif data.tipo == "ajuste":
        producto.stock_actual = data.cantidad
    movimiento = Movimiento(
        producto_id=data.producto_id, tipo=data.tipo, cantidad=data.cantidad,
        stock_resultante=producto.stock_actual, motivo=data.motivo, fecha=datetime.utcnow(),
    )
    db.add(movimiento)
    await db.flush()
    await db.refresh(movimiento)
    return movimiento


@router.get("/{producto_id}", response_model=list[MovimientoResponse])
async def listar_movimientos(
    producto_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    stmt = select(Movimiento).where(Movimiento.producto_id == producto_id).order_by(Movimiento.fecha.desc()).limit(100)
    result = await db.execute(stmt)
    return result.scalars().all()
