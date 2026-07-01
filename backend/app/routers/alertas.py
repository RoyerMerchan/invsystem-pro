"""Router: /api/v1/alertas"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Producto, Usuario
from app.routers.auth import get_current_user

router = APIRouter()


@router.get("/", summary="Obtener alertas de inventario")
async def obtener_alertas(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    result = await db.execute(select(Producto))
    productos = [p for p in result.scalars().all() if p.activo]

    sin_stock = [p for p in productos if p.stock_actual == 0]
    stock_bajo = [p for p in productos if 0 < p.stock_actual < p.stock_minimo]
    stock_exceso = [p for p in productos if p.stock_maximo > 0 and p.stock_actual > p.stock_maximo]
    ids_alerta = set(p.id for p in sin_stock + stock_bajo + stock_exceso)
    ok = [p for p in productos if p.id not in ids_alerta]

    return {
        "resumen": {
            "sin_stock": len(sin_stock),
            "stock_bajo": len(stock_bajo),
            "stock_exceso": len(stock_exceso),
            "normal": len(ok),
            "total": len(productos),
        },
        "sin_stock": sin_stock,
        "stock_bajo": stock_bajo,
        "stock_exceso": stock_exceso,
    }
