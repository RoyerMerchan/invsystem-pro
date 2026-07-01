"""Router: /api/v1/ventas"""
import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Producto, Movimiento, Venta, VentaDetalle, Usuario
from app.routers.auth import get_current_user
from app.schemas import VentaCreate, VentaResponse

router = APIRouter()


@router.post("/importar", summary="Importar ventas desde CSV")
async def importar_ventas_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if current_user.rol == "consulta":
        raise HTTPException(403, detail="Los invitados no pueden importar datos.")

    if not file.filename.endswith(".csv"):
        raise HTTPException(400, detail="Solo se aceptan archivos CSV.")

    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    requeridos = {"sku", "fecha", "cantidad"}
    columnas = set(reader.fieldnames or [])
    if not requeridos.issubset(columnas):
        raise HTTPException(400, detail=f"CSV debe tener columnas: {', '.join(requeridos)}. Encontradas: {', '.join(columnas)}")

    results = {"ok": 0, "errores": [], "total_registros": 0, "detalles": []}
    filas = list(reader)
    results["total_registros"] = len(filas)

    for i, row in enumerate(filas, 2):
        linea = f"Linea {i}"
        try:
            sku = row.get("sku", "").strip().upper()
            fecha_str = row.get("fecha", "").strip()
            cantidad = int(row.get("cantidad", "0").strip())
            precio = float(row.get("precio_unitario", "0").strip() or "0")
            sede = row.get("sede", "").strip()

            if not sku:
                results["errores"].append({"linea": i, "error": "SKU vacio"})
                continue
            if cantidad <= 0:
                results["errores"].append({"linea": i, "error": f"Cantidad invalida: {cantidad}", "sku": sku})
                continue
            try:
                fecha = datetime.fromisoformat(fecha_str) if "T" in fecha_str else datetime.strptime(fecha_str, "%Y-%m-%d")
            except ValueError:
                results["errores"].append({"linea": i, "error": f"Fecha invalida: {fecha_str}", "sku": sku})
                continue

            prod = await db.execute(select(Producto).where(Producto.sku == sku))
            prod = prod.scalar_one_or_none()
            if not prod:
                results["errores"].append({"linea": i, "error": f"SKU no encontrado: {sku}"})
                continue
            if not prod.activo:
                results["errores"].append({"linea": i, "error": f"Producto inactivo: {sku} ({prod.nombre})"})
                continue

            subtotal = cantidad * precio
            venta = Venta(
                fecha_venta=fecha, usuario_id=current_user.id,
                total=subtotal, sede=sede,
            )
            db.add(venta)
            await db.flush()

            detalle = VentaDetalle(
                venta_id=venta.id, producto_id=prod.id,
                cantidad=cantidad, precio_unitario=precio, subtotal=subtotal,
            )
            db.add(detalle)

            prod.stock_actual = max(0, prod.stock_actual - cantidad)
            movimiento = Movimiento(
                producto_id=prod.id, tipo="salida", cantidad=cantidad,
                stock_resultante=prod.stock_actual,
                motivo=f"Importacion historica (Venta #{venta.id})",
                fecha=fecha,
            )
            db.add(movimiento)
            results["ok"] += 1
            results["detalles"].append({
                "venta_id": venta.id, "producto": prod.nombre,
                "sku": sku, "cantidad": cantidad, "fecha": fecha_str,
            })
        except Exception as e:
            results["errores"].append({"linea": linea, "error": str(e), "sku": row.get("sku", "")})

    await db.flush()
    return results


@router.post("/", response_model=VentaResponse, status_code=201, summary="Registrar venta")
async def crear_venta(
    data: VentaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if current_user.rol == "consulta":
        raise HTTPException(403, detail="Los invitados no pueden registrar ventas.")

    detalles = []
    total = 0.0
    for det in data.detalles:
        prod = await db.get(Producto, det.producto_id)
        if not prod or not prod.activo:
            raise HTTPException(404, detail=f"Producto {det.producto_id} no encontrado o inactivo.")
        if prod.stock_actual < det.cantidad:
            raise HTTPException(400, detail=f"Stock insuficiente para '{prod.nombre}': disponible {prod.stock_actual}, solicitado {det.cantidad}.")
        subtotal = det.cantidad * det.precio_unitario
        detalles.append({
            "producto": prod,
            "cantidad": det.cantidad,
            "precio_unitario": det.precio_unitario,
            "subtotal": subtotal,
        })
        total += subtotal

    venta = Venta(
        fecha_venta=data.fecha_venta or datetime.utcnow(),
        usuario_id=current_user.id,
        total=total,
        sede=data.sede,
    )
    db.add(venta)
    await db.flush()

    for d in detalles:
        prod = d["producto"]
        detalle = VentaDetalle(
            venta_id=venta.id,
            producto_id=prod.id,
            cantidad=d["cantidad"],
            precio_unitario=d["precio_unitario"],
            subtotal=d["subtotal"],
        )
        db.add(detalle)
        prod.stock_actual -= d["cantidad"]
        movimiento = Movimiento(
            producto_id=prod.id,
            tipo="salida",
            cantidad=d["cantidad"],
            stock_resultante=prod.stock_actual,
            motivo=f"Venta #{venta.id}",
            fecha=venta.fecha_venta,
        )
        db.add(movimiento)

    await db.flush()
    await db.refresh(venta)
    return await _venta_to_response(venta, db)


@router.get("/", response_model=list[VentaResponse], summary="Listar ventas")
async def listar_ventas(
    desde: str | None = Query(None, description="Fecha inicio YYYY-MM-DD"),
    hasta: str | None = Query(None, description="Fecha fin YYYY-MM-DD"),
    producto_id: int | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    stmt = select(Venta).order_by(desc(Venta.fecha_venta))
    if desde:
        stmt = stmt.where(Venta.fecha_venta >= datetime.fromisoformat(desde))
    if hasta:
        stmt = stmt.where(Venta.fecha_venta <= datetime.fromisoformat(hasta))
    if producto_id:
        stmt = stmt.where(Venta.id.in_(
            select(VentaDetalle.venta_id).where(VentaDetalle.producto_id == producto_id)
        ))
    stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    ventas = result.scalars().all()
    return [await _venta_to_response(v, db) for v in ventas]


@router.get("/{venta_id}", response_model=VentaResponse, summary="Obtener venta")
async def obtener_venta(
    venta_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    venta = await db.get(Venta, venta_id)
    if not venta:
        raise HTTPException(404, detail="Venta no encontrada.")
    return await _venta_to_response(venta, db)


@router.get("/producto/{producto_id}", summary="Historial de ventas de un producto")
async def ventas_por_producto(
    producto_id: int,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    stmt = (
        select(VentaDetalle, Venta.fecha_venta, Venta.sede)
        .join(Venta, VentaDetalle.venta_id == Venta.id)
        .where(VentaDetalle.producto_id == producto_id)
        .order_by(desc(Venta.fecha_venta))
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return [
        {
            "id": row.VentaDetalle.id,
            "venta_id": row.VentaDetalle.venta_id,
            "fecha": str(row.fecha_venta)[:19],
            "cantidad": row.VentaDetalle.cantidad,
            "precio_unitario": row.VentaDetalle.precio_unitario,
            "subtotal": row.VentaDetalle.subtotal,
            "sede": row.sede,
        }
        for row in rows
    ]


async def _venta_to_response(venta: Venta, db: AsyncSession) -> dict:
    result = await db.execute(
        select(VentaDetalle, Producto.nombre)
        .join(Producto, VentaDetalle.producto_id == Producto.id)
        .where(VentaDetalle.venta_id == venta.id)
    )
    detalles = []
    for row in result.all():
        detalles.append({
            "id": row.VentaDetalle.id,
            "producto_id": row.VentaDetalle.producto_id,
            "producto_nombre": row.nombre,
            "cantidad": row.VentaDetalle.cantidad,
            "precio_unitario": row.VentaDetalle.precio_unitario,
            "subtotal": row.VentaDetalle.subtotal,
        })
    usuario = await db.get(Usuario, venta.usuario_id)
    return {
        "id": venta.id,
        "fecha_venta": venta.fecha_venta,
        "usuario_nombre": usuario.nombre if usuario else "",
        "total": venta.total,
        "sede": venta.sede,
        "detalles": detalles,
        "creado_en": venta.creado_en,
    }
