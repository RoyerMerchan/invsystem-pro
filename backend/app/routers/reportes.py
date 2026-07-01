"""
Router: /api/v1/reportes
Endpoints para generar y descargar reportes en Excel y PDF.
"""
import csv
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import io

from app.core.database import get_db
from app.models.models import Producto, Movimiento, ProyeccionGuardada, Venta, Usuario
from app.routers.auth import get_current_user
from app.services.reportes import generar_excel, generar_pdf

router = APIRouter()


async def _get_data(db: AsyncSession):
    """Obtiene productos, movimientos y alertas de la BD."""
    res_p = await db.execute(select(Producto).order_by(Producto.categoria, Producto.nombre))
    productos = [
        {
            "id": p.id, "nombre": p.nombre, "categoria": p.categoria,
            "sku": p.sku, "stock_actual": p.stock_actual,
            "stock_minimo": p.stock_minimo, "precio_unitario": p.precio_unitario,
            "costo_unitario": p.costo_unitario, "unidad_medida": p.unidad_medida,
        }
        for p in res_p.scalars().all()
    ]

    res_m = await db.execute(
        select(Movimiento, Producto.nombre.label("prod_nombre"))
        .join(Producto, Movimiento.producto_id == Producto.id)
        .order_by(Movimiento.fecha.desc())
        .limit(200)
    )
    movimientos = [
        {
            "fecha": str(row.Movimiento.fecha),
            "producto_nombre": row.prod_nombre,
            "tipo": row.Movimiento.tipo,
            "cantidad": row.Movimiento.cantidad,
            "stock_resultante": row.Movimiento.stock_resultante,
            "motivo": row.Movimiento.motivo,
        }
        for row in res_m.all()
    ]

    sin_stock  = [p for p in productos if p["stock_actual"] == 0]
    stock_bajo = [p for p in productos if 0 < p["stock_actual"] < p["stock_minimo"]]
    alertas = {
        "resumen": {
            "sin_stock": len(sin_stock),
            "stock_bajo": len(stock_bajo),
            "normal": len(productos) - len(sin_stock) - len(stock_bajo),
        },
        "sin_stock": sin_stock,
        "stock_bajo": stock_bajo,
    }

    return productos, movimientos, alertas


# ── Excel ────────────────────────────────────────────────────────
@router.get("/excel", summary="Descargar reporte Excel completo")
async def reporte_excel(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    productos, movimientos, alertas = await _get_data(db)
    data = generar_excel(productos, movimientos, alertas)
    filename = f"invsystem_reporte_{date.today().isoformat()}.xlsx"
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ── PDF ──────────────────────────────────────────────────────────
@router.get("/pdf", summary="Descargar reporte PDF")
async def reporte_pdf(
    tipo: str = Query("inventario", enum=["inventario", "alertas", "completo"]),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    productos, movimientos, alertas = await _get_data(db)
    data = generar_pdf(productos, movimientos, alertas, tipo=tipo)
    filename = f"invsystem_{tipo}_{date.today().isoformat()}.pdf"
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ── Vista previa (metadata) ──────────────────────────────────────
@router.get("/preview", summary="Resumen del reporte antes de descargar")
async def preview_reporte(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    productos, movimientos, alertas = await _get_data(db)
    total_val = sum(p["stock_actual"] * p["precio_unitario"] for p in productos)
    return {
        "total_productos": len(productos),
        "total_movimientos": len(movimientos),
        "valor_inventario": round(total_val, 2),
        "sin_stock": alertas["resumen"]["sin_stock"],
        "stock_bajo": alertas["resumen"]["stock_bajo"],
        "fecha": date.today().isoformat(),
        "formatos_disponibles": ["excel", "pdf_inventario", "pdf_alertas", "pdf_completo", "csv_inventario", "csv_movimientos"],
    }


# ── CSV ─────────────────────────────────────────────────────────
@router.get("/csv/inventario", summary="Descargar inventario en CSV")
async def reporte_csv_inventario(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    res = await db.execute(select(Producto).order_by(Producto.categoria, Producto.nombre))
    productos = res.scalars().all()
    output = io.StringIO()
    w = csv.writer(output)
    w.writerow(["SKU", "Nombre", "Categoría", "Stock", "Mínimo", "Máximo", "Precio", "Estado"])
    for p in productos:
        estado = "Inactivo" if not p.activo else ("Sin stock" if p.stock_actual == 0 else "Stock bajo" if p.stock_actual < p.stock_minimo else "Normal")
        w.writerow([p.sku, p.nombre, p.categoria, p.stock_actual, p.stock_minimo, p.stock_maximo, p.precio_unitario, estado])
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=invsystem_inventario_{date.today().isoformat()}.csv"},
    )


@router.get("/csv/movimientos", summary="Descargar movimientos en CSV")
async def reporte_csv_movimientos(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    res = await db.execute(
        select(Movimiento, Producto.nombre.label("prod_nombre"))
        .join(Producto, Movimiento.producto_id == Producto.id)
        .order_by(Movimiento.fecha.desc())
        .limit(1000)
    )
    output = io.StringIO()
    w = csv.writer(output)
    w.writerow(["Fecha", "Producto", "Tipo", "Cantidad", "Stock resultante", "Motivo"])
    for row in res.all():
        w.writerow([str(row.Movimiento.fecha)[:19], row.prod_nombre, row.Movimiento.tipo, row.Movimiento.cantidad, row.Movimiento.stock_resultante, row.Movimiento.motivo])
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=invsystem_movimientos_{date.today().isoformat()}.csv"},
    )


@router.get("/csv/proyeccion/{proyeccion_id}", summary="Descargar proyección en CSV")
async def reporte_csv_proyeccion(
    proyeccion_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    p = await db.get(ProyeccionGuardada, proyeccion_id)
    if not p:
        raise HTTPException(404, detail="Proyección no encontrada.")
    import json
    puntos = json.loads(p.puntos) if isinstance(p.puntos, str) else p.puntos
    output = io.StringIO()
    w = csv.writer(output)
    w.writerow(["Fecha", "Valor", "IC Inferior", "IC Superior"])
    for pt in (puntos if isinstance(puntos, list) else []):
        w.writerow([pt.get("fecha", ""), pt.get("valor", 0), pt.get("lower_95", 0), pt.get("upper_95", 0)])
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=proyeccion_{proyeccion_id}_{date.today().isoformat()}.csv"},
    )


@router.get("/csv/ventas", summary="Descargar ventas en CSV")
async def reporte_csv_ventas(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    res = await db.execute(
        select(Venta).order_by(Venta.fecha_venta.desc()).limit(500)
    )
    ventas = res.scalars().all()
    output = io.StringIO()
    w = csv.writer(output)
    w.writerow(["#", "Fecha", "Total", "Sede"])
    for v in ventas:
        w.writerow([v.id, str(v.fecha_venta)[:19], v.total, v.sede])
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=invsystem_ventas_{date.today().isoformat()}.csv"},
    )
