"""Router: /api/v1/ventas"""
import csv
import io
import unicodedata
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Producto, Movimiento, Venta, VentaDetalle, Usuario
from app.routers.auth import get_current_user
from app.schemas import VentaCreate, VentaResponse

router = APIRouter()

# Formato CSV PRINCIPAL de historial de demanda: sku,nombre,fecha,cantidad,tipo,precio,sede
# (importar y exportar usan este mismo formato; al importar se aceptan además
#  muchos otros formatos gracias a los alias de columnas de más abajo)
CSV_COLUMNAS = ["sku", "nombre", "fecha", "cantidad", "tipo", "precio", "sede"]
_FORMATOS_FECHA = ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y")

# Alias de columnas: cada campo canónico acepta muchos nombres de cabecera para
# tolerar formatos externos. Los alias se comparan ya normalizados (sin acentos,
# minúsculas, separadores unificados a "_").
CAMPOS_ALIAS: dict[str, list[str]] = {
    "sku": ["sku", "codigo", "cod", "code", "referencia", "ref", "id_producto", "producto_id", "cod_producto", "codigo_producto", "item", "articulo", "clave"],
    "nombre": ["nombre", "producto", "descripcion", "detalle", "product", "name", "nombre_producto", "articulo_nombre", "item_name", "descripcion_producto"],
    "fecha": ["fecha", "date", "dia", "periodo", "fecha_venta", "fecha_movimiento", "fecha_salida", "fecha_operacion", "timestamp"],
    "cantidad": ["cantidad", "cant", "qty", "quantity", "unidades", "und", "uds", "ventas", "demanda", "vendidos", "salidas", "volumen", "cantidad_vendida"],
    "precio": ["precio_unitario", "precio", "price", "unit_price", "valor", "valor_unitario", "costo", "precio_venta", "importe", "pu"],
    "sede": ["sede", "tienda", "sucursal", "store", "location", "ubicacion", "ciudad", "bodega", "almacen", "punto_venta", "local", "region"],
    "tipo": ["tipo", "type", "movimiento", "operacion", "clase", "tipo_movimiento"],
}

# Valores de la columna "tipo" que representan una ENTRADA de inventario.
# Cualquier otro valor (incluido vacío) se trata como salida/venta = demanda.
_TIPOS_ENTRADA = {"entrada", "ingreso", "compra", "in", "entry", "reposicion", "abastecimiento"}


def _norm(texto: str) -> str:
    """Normaliza una cabecera: sin acentos, minúsculas, separadores -> '_'."""
    t = unicodedata.normalize("NFKD", texto or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = t.strip().lower()
    for ch in (" ", "-", ".", "/", "\\"):
        t = t.replace(ch, "_")
    while "__" in t:
        t = t.replace("__", "_")
    return t.strip("_")


def _parsear_fecha(valor: str) -> datetime:
    """Acepta ISO (con hora) y varios formatos de fecha comunes."""
    valor = valor.strip()
    if "T" in valor:
        return datetime.fromisoformat(valor)
    for fmt in _FORMATOS_FECHA:
        try:
            return datetime.strptime(valor, fmt)
        except ValueError:
            continue
    raise ValueError(valor)


def _leer_csv(text: str):
    """Detecta el delimitador y mapea cada campo canónico a su cabecera real.

    Devuelve (filas, mapa, valor) donde `mapa` es {campo_canónico: cabecera_original}
    (resuelto a partir de los alias) y `valor(row, campo)` lee ese campo tolerando
    mayúsculas, acentos y separadores distintos en la cabecera.
    """
    muestra = "\n".join(text.splitlines()[:5])
    try:
        dialecto = csv.Sniffer().sniff(muestra, delimiters=",;\t|")
    except csv.Error:
        dialecto = csv.excel  # coma por defecto

    reader = csv.DictReader(io.StringIO(text), dialect=dialecto)
    filas = list(reader)

    # cabecera normalizada -> cabecera original
    presentes = {_norm(h): h for h in (reader.fieldnames or [])}
    # campo canónico -> cabecera original (primer alias presente gana)
    mapa: dict[str, str] = {}
    for campo, alias in CAMPOS_ALIAS.items():
        for a in alias:
            if a in presentes:
                mapa[campo] = presentes[a]
                break

    def valor(row: dict, campo: str) -> str:
        h = mapa.get(campo)
        return (row.get(h) or "").strip() if h else ""

    return filas, mapa, valor


@router.post("/importar", summary="Importar ventas desde CSV")
async def importar_ventas_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if current_user.rol == "consulta":
        raise HTTPException(403, detail="Los invitados no pueden importar datos.")

    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(400, detail="Solo se aceptan archivos CSV.")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")  # tolera Excel en Windows

    filas, mapa, valor = _leer_csv(text)

    # Requeridos: fecha, cantidad y al menos un identificador (sku o nombre).
    faltan = []
    if "fecha" not in mapa:
        faltan.append("fecha")
    if "cantidad" not in mapa:
        faltan.append("cantidad")
    if "sku" not in mapa and "nombre" not in mapa:
        faltan.append("sku o nombre")
    if faltan:
        reconocidas = ", ".join(mapa) or "ninguna"
        raise HTTPException(400, detail=f"Faltan columnas obligatorias: {', '.join(faltan)}. Columnas reconocidas: {reconocidas}")

    # Precargamos los productos una sola vez y los indexamos por SKU y por nombre
    # para emparejar cada fila sin una consulta por registro.
    productos = (await db.execute(select(Producto))).scalars().all()
    por_sku = {p.sku.upper(): p for p in productos if p.sku}
    por_nombre: dict[str, Producto] = {}
    for p in productos:
        por_nombre.setdefault((p.nombre or "").strip().lower(), p)

    results = {"ok": 0, "errores": [], "total_registros": len(filas), "detalles": []}

    # Toda la importación es atómica: si ocurre un error inesperado (p. ej. la BD),
    # se revierte TODO y no queda nada a medias.
    try:
        for i, row in enumerate(filas, 2):
            sku = valor(row, "sku").upper()
            nombre = valor(row, "nombre")
            fecha_str = valor(row, "fecha")
            cantidad_str = valor(row, "cantidad")
            precio_str = valor(row, "precio")
            sede = valor(row, "sede")
            tipo_str = valor(row, "tipo")

            # Emparejar producto: primero por SKU, luego por nombre.
            prod = por_sku.get(sku) if sku else None
            if prod is None and nombre:
                prod = por_nombre.get(nombre.strip().lower())
            if prod is None:
                ident = sku or nombre or "(sin identificador)"
                results["errores"].append({"linea": i, "error": f"Producto no encontrado: {ident}", "sku": sku or nombre}); continue
            if not prod.activo:
                results["errores"].append({"linea": i, "error": f"Producto inactivo: {prod.sku} ({prod.nombre})", "sku": prod.sku}); continue

            try:
                cantidad = int(float(cantidad_str))  # tolera "3" y "3.0"
            except ValueError:
                results["errores"].append({"linea": i, "error": f"Cantidad inválida: '{cantidad_str}'", "sku": prod.sku}); continue
            if cantidad <= 0:
                results["errores"].append({"linea": i, "error": f"Cantidad debe ser mayor a 0: {cantidad}", "sku": prod.sku}); continue
            try:
                precio = float(precio_str.replace(",", ".")) if precio_str else 0.0
            except ValueError:
                results["errores"].append({"linea": i, "error": f"Precio inválido: '{precio_str}'", "sku": prod.sku}); continue
            try:
                fecha = _parsear_fecha(fecha_str)
            except ValueError:
                results["errores"].append({"linea": i, "error": f"Fecha inválida: '{fecha_str}' (usa AAAA-MM-DD)", "sku": prod.sku}); continue

            # ── Entrada de inventario (según columna "tipo") ──
            if _norm(tipo_str) in _TIPOS_ENTRADA:
                prod.stock_actual = prod.stock_actual + cantidad
                db.add(Movimiento(
                    producto_id=prod.id, tipo="entrada", cantidad=cantidad,
                    stock_resultante=prod.stock_actual,
                    motivo="Importación histórica (entrada)",
                    fecha=fecha,
                ))
                results["ok"] += 1
                results["detalles"].append({
                    "venta_id": None, "producto": prod.nombre, "sku": prod.sku,
                    "cantidad": cantidad, "fecha": fecha_str, "tipo": "entrada",
                })
                continue

            # ── Salida / venta (por defecto) = demanda histórica ──
            subtotal = cantidad * precio
            venta = Venta(fecha_venta=fecha, usuario_id=current_user.id, total=subtotal, sede=sede)
            db.add(venta)
            await db.flush()

            db.add(VentaDetalle(
                venta_id=venta.id, producto_id=prod.id,
                cantidad=cantidad, precio_unitario=precio, subtotal=subtotal,
            ))
            prod.stock_actual = max(0, prod.stock_actual - cantidad)
            db.add(Movimiento(
                producto_id=prod.id, tipo="salida", cantidad=cantidad,
                stock_resultante=prod.stock_actual,
                motivo=f"Importación histórica (Venta #{venta.id})",
                fecha=fecha,
            ))
            results["ok"] += 1
            results["detalles"].append({
                "venta_id": venta.id, "producto": prod.nombre, "sku": prod.sku,
                "cantidad": cantidad, "fecha": fecha_str, "tipo": "salida",
            })

        await db.flush()
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(500, detail=f"Error durante la importación; no se guardó nada (se revirtió todo). Detalle: {e}")

    return results


@router.get("/exportar", summary="Exportar ventas en CSV (mismo formato que importar)")
async def exportar_ventas_csv(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    stmt = (
        select(VentaDetalle, Venta.fecha_venta, Venta.sede, Producto.sku, Producto.nombre)
        .join(Venta, VentaDetalle.venta_id == Venta.id)
        .join(Producto, VentaDetalle.producto_id == Producto.id)
        .order_by(desc(Venta.fecha_venta))
    )
    rows = (await db.execute(stmt)).all()
    output = io.StringIO()
    w = csv.writer(output)
    w.writerow(CSV_COLUMNAS)  # sku,nombre,fecha,cantidad,tipo,precio,sede
    for r in rows:
        w.writerow([r.sku, r.nombre, str(r.fecha_venta)[:10], r.VentaDetalle.cantidad, "salida", r.VentaDetalle.precio_unitario, r.sede])
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=ventas_exportadas_{datetime.utcnow().date().isoformat()}.csv"},
    )


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
