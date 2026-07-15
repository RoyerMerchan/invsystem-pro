"""Router: /api/v1/productos"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from datetime import date, timedelta

from sqlalchemy import func, desc

from app.core.database import get_db
from app.core.security import sanitizar_texto
from app.models.models import Producto, Movimiento, Proveedor, Usuario
from app.routers.auth import get_current_user
from app.schemas import ProductoCreate, ProductoUpdate, ProductoResponse
from app.services.csv_import import decodificar, leer_csv, parse_float, parse_int

router = APIRouter()

# Alias de columnas para importar inventario. Cada campo canónico acepta varios
# nombres de cabecera (ya normalizados: sin acentos, minúsculas, "_").
PRODUCTO_ALIAS: dict[str, list[str]] = {
    "sku": ["sku", "codigo", "cod", "code", "referencia", "ref", "id_producto", "cod_producto", "codigo_producto", "item", "clave"],
    "nombre": ["nombre", "producto", "product", "name", "nombre_producto", "articulo", "descripcion_corta"],
    "descripcion": ["descripcion", "detalle", "descripcion_larga", "observaciones", "obs", "notas"],
    "categoria": ["categoria", "category", "cat", "familia", "linea", "grupo", "rubro", "departamento"],
    "stock_actual": ["stock_actual", "stock", "existencia", "existencias", "cantidad", "cant", "inventario", "unidades", "qty", "quantity", "saldo"],
    "stock_minimo": ["stock_minimo", "minimo", "min", "stock_min", "punto_reorden", "reorden", "minimo_stock"],
    "stock_maximo": ["stock_maximo", "maximo", "max", "stock_max", "maximo_stock"],
    "precio_unitario": ["precio_unitario", "precio", "price", "precio_venta", "pvp", "valor", "valor_unitario", "importe"],
    "costo_unitario": ["costo_unitario", "costo", "cost", "precio_costo", "costo_compra", "costo_unidad"],
    "unidad_medida": ["unidad_medida", "unidad", "unit", "um", "medida", "uom"],
    "proveedor": ["proveedor", "supplier", "vendor", "fabricante", "proveedor_nombre", "nombre_proveedor"],
}


@router.get("/", response_model=list[ProductoResponse], summary="Listar productos")
async def listar_productos(
    categoria: str | None = Query(None),
    solo_activos: bool = Query(True, description="Filtrar solo productos activos"),
    q: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    stmt = select(Producto).order_by(Producto.nombre)
    if solo_activos:
        stmt = stmt.where(Producto.activo == True)
    if categoria:
        stmt = stmt.where(Producto.categoria == categoria)
    if q:
        stmt = stmt.where(Producto.nombre.ilike(f"%{q}%") | Producto.sku.ilike(f"%{q}%"))
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/top-demanda", summary="Productos con mayor demanda (últimos 30 días)")
async def top_demanda(
    limit: int = Query(5, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    desde = date.today() - timedelta(days=30)
    stmt = (
        select(
            Producto.id, Producto.nombre, Producto.sku, Producto.stock_actual,
            func.coalesce(func.sum(Movimiento.cantidad), 0).label("total_salidas")
        )
        .join(Movimiento, Movimiento.producto_id == Producto.id)
        .where(Movimiento.tipo == "salida", Movimiento.fecha >= desde, Producto.activo == True)
        .group_by(Producto.id)
        .order_by(desc("total_salidas"))
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [{"id": r.id, "nombre": r.nombre, "sku": r.sku, "stock_actual": r.stock_actual, "total_vendido": int(r.total_salidas)} for r in result.all()]


@router.get("/menor-rotacion", summary="Productos con menor rotación")
async def menor_rotacion(
    limit: int = Query(5, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    desde = date.today() - timedelta(days=60)
    stmt = (
        select(
            Producto.id, Producto.nombre, Producto.sku, Producto.stock_actual, Producto.stock_minimo,
            func.coalesce(func.sum(Movimiento.cantidad), 0).label("total_salidas")
        )
        .outerjoin(Movimiento, Movimiento.producto_id == Producto.id)
        .where(Movimiento.tipo == "salida", Movimiento.fecha >= desde, Producto.activo == True)
        .group_by(Producto.id)
        .order_by(desc("total_salidas"))
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [{"id": r.id, "nombre": r.nombre, "sku": r.sku, "stock_actual": r.stock_actual, "total_vendido_60d": int(r.total_salidas)} for r in result.all()]

# ── Ventas historicas ──────────────────────────────────────
@router.get("/ventas-historicas", summary="Ventas diarias totales de los últimos N días")
async def ventas_historicas(
    dias: int = Query(30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    desde = date.today() - timedelta(days=dias)
    stmt = (
        select(
            func.date(Movimiento.fecha).label("dia"),
            func.coalesce(func.sum(Movimiento.cantidad), 0).label("total")
        )
        .where(Movimiento.tipo == "salida", Movimiento.fecha >= desde)
        .group_by(func.date(Movimiento.fecha))
        .order_by("dia")
    )
    result = await db.execute(stmt)
    return [{"fecha": str(r.dia), "total": int(r.total)} for r in result.all()]


@router.post("/", response_model=ProductoResponse, status_code=201, summary="Crear producto")
async def crear_producto(
    data: ProductoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if current_user.rol != "administrador":
        raise HTTPException(403, detail="Solo administradores pueden crear productos.")
    # data.sku ya llega normalizado (mayúsculas, sin espacios) por el validador del schema.
    # La comparación es insensible a mayúsculas/espacios para detectar duplicados legados.
    existing = await db.execute(
        select(Producto).where(func.upper(func.trim(Producto.sku)) == data.sku)
    )
    if existing.scalars().first():
        raise HTTPException(400, detail=f"SKU '{data.sku}' ya existe.")
    producto = Producto(**data.model_dump())
    db.add(producto)
    await db.flush()
    await db.refresh(producto)
    return producto


@router.post("/importar", summary="Importar inventario (productos) desde CSV")
async def importar_productos_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Crea o actualiza productos a partir de un CSV.

    Se empareja por **SKU**: si el SKU ya existe se actualizan los campos
    presentes; si no existe se crea el producto. Columnas obligatorias:
    **sku** y **nombre** (la categoría se asume "General" si falta).
    """
    if current_user.rol != "administrador":
        raise HTTPException(403, detail="Solo administradores pueden importar productos.")
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(400, detail="Solo se aceptan archivos CSV.")

    text = decodificar(await file.read())
    filas, mapa, valor = leer_csv(text, PRODUCTO_ALIAS)

    faltan = [c for c in ("sku", "nombre") if c not in mapa]
    if faltan:
        reconocidas = ", ".join(mapa) or "ninguna"
        raise HTTPException(400, detail=f"Faltan columnas obligatorias: {', '.join(faltan)}. Columnas reconocidas: {reconocidas}")

    # Precargamos productos (por SKU) y proveedores (por nombre) una sola vez.
    productos = (await db.execute(select(Producto))).scalars().all()
    por_sku = {p.sku.upper(): p for p in productos if p.sku}
    proveedores = (await db.execute(select(Proveedor))).scalars().all()
    prov_por_nombre = {(p.nombre or "").strip().lower(): p for p in proveedores}

    results = {
        "ok": 0, "creados": 0, "actualizados": 0,
        "errores": [], "total_registros": len(filas), "detalles": [],
    }

    try:
        for i, row in enumerate(filas, 2):  # fila 1 = cabecera
            sku = valor(row, "sku").strip().upper()
            if not sku:
                results["errores"].append({"linea": i, "error": "SKU vacío", "sku": ""}); continue

            existente = por_sku.get(sku)

            # ── Campos numéricos: se validan solo si vienen en la fila ──
            campos: dict = {}
            fila_error = None
            for campo, parser, etiqueta in (
                ("stock_actual", parse_int, "stock"),
                ("stock_minimo", parse_int, "stock mínimo"),
                ("stock_maximo", parse_int, "stock máximo"),
                ("precio_unitario", parse_float, "precio"),
                ("costo_unitario", parse_float, "costo"),
            ):
                crudo = valor(row, campo)
                if crudo == "":
                    continue
                try:
                    n = parser(crudo)
                except ValueError:
                    fila_error = f"{etiqueta.capitalize()} inválido: '{crudo}'"; break
                if n < 0:
                    fila_error = f"{etiqueta.capitalize()} no puede ser negativo: {n}"; break
                campos[campo] = n
            if fila_error:
                results["errores"].append({"linea": i, "error": fila_error, "sku": sku}); continue

            # Texto (sanitizado contra XSS, igual que el resto de la API).
            # Se acotan longitudes a las columnas de la BD para no romper la carga.
            nombre = sanitizar_texto(valor(row, "nombre"), max_len=200)
            descripcion = sanitizar_texto(valor(row, "descripcion")) if "descripcion" in mapa else None
            categoria = sanitizar_texto(valor(row, "categoria"), max_len=50) if "categoria" in mapa else None
            unidad = valor(row, "unidad_medida")[:20] if "unidad_medida" in mapa else None

            # Proveedor por nombre (opcional; se ignora si no coincide)
            prov = None
            if "proveedor" in mapa:
                nombre_prov = valor(row, "proveedor").strip().lower()
                if nombre_prov:
                    prov = prov_por_nombre.get(nombre_prov)

            if existente:
                # ── Actualizar solo los campos presentes ──
                if nombre:
                    existente.nombre = nombre
                if descripcion is not None:
                    existente.descripcion = descripcion
                if categoria:
                    existente.categoria = categoria
                if unidad:
                    existente.unidad_medida = unidad
                for k, v in campos.items():
                    setattr(existente, k, v)
                if prov is not None:
                    existente.proveedor_id = prov.id
                results["actualizados"] += 1
                results["detalles"].append({"accion": "actualizado", "sku": sku, "nombre": existente.nombre})
            else:
                # ── Crear ──
                if not nombre:
                    results["errores"].append({"linea": i, "error": "Producto nuevo sin nombre", "sku": sku}); continue
                nuevo = Producto(
                    sku=sku,
                    nombre=nombre,
                    descripcion=descripcion or "",
                    categoria=categoria or "General",
                    stock_actual=campos.get("stock_actual", 0),
                    stock_minimo=campos.get("stock_minimo", 0),
                    stock_maximo=campos.get("stock_maximo", 0),
                    precio_unitario=campos.get("precio_unitario", 0.0),
                    costo_unitario=campos.get("costo_unitario", 0.0),
                    unidad_medida=unidad or "unidad",
                    proveedor_id=prov.id if prov is not None else None,
                    activo=True,
                )
                db.add(nuevo)
                por_sku[sku] = nuevo  # evita duplicar si el SKU se repite en el archivo
                results["creados"] += 1
                results["detalles"].append({"accion": "creado", "sku": sku, "nombre": nombre})

        await db.flush()
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(500, detail=f"Error durante la importación; no se guardó nada (se revirtió todo). Detalle: {e}")

    results["ok"] = results["creados"] + results["actualizados"]
    return results


@router.get("/{producto_id}", response_model=ProductoResponse, summary="Obtener producto")
async def obtener_producto(
    producto_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    p = await db.get(Producto, producto_id)
    if not p:
        raise HTTPException(404, detail="Producto no encontrado")
    return p


@router.patch("/{producto_id}", response_model=ProductoResponse, summary="Actualizar producto")
async def actualizar_producto(
    producto_id: int,
    data: ProductoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if current_user.rol != "administrador":
        raise HTTPException(403, detail="Solo administradores pueden modificar productos.")
    p = await db.get(Producto, producto_id)
    if not p:
        raise HTTPException(404, detail="Producto no encontrado")
    for campo, valor in data.model_dump(exclude_unset=True).items():
        setattr(p, campo, valor)
    await db.flush()
    await db.refresh(p)
    return p


@router.delete("/{producto_id}", status_code=204, summary="Desactivar producto (soft-delete)")
async def desactivar_producto(
    producto_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if current_user.rol != "administrador":
        raise HTTPException(403, detail="Solo administradores pueden desactivar productos.")
    p = await db.get(Producto, producto_id)
    if not p:
        raise HTTPException(404, detail="Producto no encontrado")
    p.activo = False
    await db.flush()
