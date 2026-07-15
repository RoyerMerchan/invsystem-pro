"""
Router: /api/v1/proveedores
CRUD completo de proveedores con validación de roles.
Solo administradores pueden crear, actualizar o eliminar.
Cualquier usuario autenticado puede listar.
"""


from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import sanitizar_texto
from app.models.models import Proveedor, Producto, Usuario
from app.routers.auth import get_current_user
from app.schemas import (
    ProveedorCreate, ProveedorUpdate,
    ProveedorResponse, ProveedorResumen,
)
from app.services.csv_import import decodificar, leer_csv

router = APIRouter()

# Alias de columnas para importar proveedores (cabeceras ya normalizadas).
PROVEEDOR_ALIAS: dict[str, list[str]] = {
    "nombre": ["nombre", "proveedor", "empresa", "razon_social", "company", "name", "supplier"],
    "contacto": ["contacto", "contact", "persona", "persona_contacto", "responsable", "encargado", "vendedor"],
    "email": ["email", "correo", "e_mail", "mail", "correo_electronico"],
    "telefono": ["telefono", "phone", "tel", "celular", "movil", "numero", "contacto_telefono"],
    "direccion": ["direccion", "address", "dir", "ubicacion", "domicilio"],
}



def _require_admin(user: Usuario) -> None:
    """Lanza 403 si el usuario no es administrador."""
    if user.rol != "administrador":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol de administrador para esta acción.",
        )


# ── GET /  ── Listar proveedores ─────────────────────────────────
@router.get("/", response_model=list[ProveedorResponse], summary="Listar proveedores")
async def listar_proveedores(
    solo_activos: bool = Query(True, description="Filtrar solo proveedores activos"),
    q: str | None = Query(None, description="Buscar por nombre"),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    stmt = select(Proveedor).order_by(Proveedor.nombre)
    if solo_activos:
        stmt = stmt.where(Proveedor.activo == True)
    if q:
        stmt = stmt.where(Proveedor.nombre.ilike(f"%{q}%"))
    result = await db.execute(stmt)
    return result.scalars().all()


# ── GET /resumen ── Lista ligera para dropdowns ──────────────────
@router.get("/resumen", response_model=list[ProveedorResumen], summary="Lista ligera para selects")
async def resumen_proveedores(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    result = await db.execute(
        select(Proveedor).where(Proveedor.activo == True).order_by(Proveedor.nombre)
    )
    return result.scalars().all()


# ── GET /{id} ── Detalle proveedor ────────────────────────────────
@router.get("/{proveedor_id}", response_model=ProveedorResponse, summary="Obtener proveedor")
async def obtener_proveedor(
    proveedor_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    p = await db.get(Proveedor, proveedor_id)
    if not p:
        raise HTTPException(404, detail="Proveedor no encontrado.")
    return p


# ── GET /{id}/productos ── Productos de un proveedor ─────────────
@router.get("/{proveedor_id}/productos", summary="Productos de un proveedor")
async def productos_del_proveedor(
    proveedor_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    p = await db.get(Proveedor, proveedor_id)
    if not p:
        raise HTTPException(404, detail="Proveedor no encontrado.")
    result = await db.execute(
        select(Producto)
        .where(Producto.proveedor_id == proveedor_id)
        .order_by(Producto.nombre)
    )
    productos = result.scalars().all()
    return {
        "proveedor": p.nombre,
        "total": len(productos),
        "productos": productos,
    }


# ── POST / ── Crear proveedor (solo admin) ────────────────────────
@router.post(
    "/",
    response_model=ProveedorResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear proveedor (admin)",
)
async def crear_proveedor(
    data: ProveedorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_admin(current_user)

    # Verificar nombre único
    existing = await db.execute(
        select(Proveedor).where(func.lower(Proveedor.nombre) == data.nombre.lower())
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, detail=f"Ya existe un proveedor con el nombre '{data.nombre}'.")

    proveedor = Proveedor(**data.model_dump())
    db.add(proveedor)
    await db.flush()
    await db.refresh(proveedor)
    return proveedor


# ── POST /importar ── Importar proveedores desde CSV (solo admin) ─
@router.post("/importar", summary="Importar proveedores desde CSV (admin)")
async def importar_proveedores_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Crea o actualiza proveedores desde un CSV.

    Se empareja por **nombre** (sin distinguir mayúsculas): si ya existe se
    actualizan los campos presentes; si no, se crea. Única columna obligatoria:
    **nombre**.
    """
    _require_admin(current_user)
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(400, detail="Solo se aceptan archivos CSV.")

    text = decodificar(await file.read())
    filas, mapa, valor = leer_csv(text, PROVEEDOR_ALIAS)

    if "nombre" not in mapa:
        reconocidas = ", ".join(mapa) or "ninguna"
        raise HTTPException(400, detail=f"Falta la columna obligatoria: nombre. Columnas reconocidas: {reconocidas}")

    proveedores = (await db.execute(select(Proveedor))).scalars().all()
    por_nombre = {(p.nombre or "").strip().lower(): p for p in proveedores}

    results = {
        "ok": 0, "creados": 0, "actualizados": 0,
        "errores": [], "total_registros": len(filas), "detalles": [],
    }

    try:
        for i, row in enumerate(filas, 2):  # fila 1 = cabecera
            nombre = sanitizar_texto(valor(row, "nombre"), max_len=200)
            if not nombre:
                results["errores"].append({"linea": i, "error": "Nombre vacío", "sku": ""}); continue

            # Longitudes acotadas a las columnas de la BD.
            contacto = sanitizar_texto(valor(row, "contacto"), max_len=100) if "contacto" in mapa else None
            direccion = sanitizar_texto(valor(row, "direccion")) if "direccion" in mapa else None
            telefono = valor(row, "telefono").strip()[:30] if "telefono" in mapa else None
            email = valor(row, "email").strip()[:200] if "email" in mapa else None
            email = email or None  # cadena vacía -> None (la columna es nullable)

            existente = por_nombre.get(nombre.strip().lower())
            if existente:
                if contacto is not None:
                    existente.contacto = contacto
                if direccion is not None:
                    existente.direccion = direccion
                if telefono is not None:
                    existente.telefono = telefono
                if email is not None:
                    existente.email = email
                results["actualizados"] += 1
                results["detalles"].append({"accion": "actualizado", "nombre": nombre})
            else:
                nuevo = Proveedor(
                    nombre=nombre,
                    contacto=contacto or "",
                    direccion=direccion or "",
                    telefono=telefono or "",
                    email=email,
                    activo=True,
                )
                db.add(nuevo)
                por_nombre[nombre.strip().lower()] = nuevo
                results["creados"] += 1
                results["detalles"].append({"accion": "creado", "nombre": nombre})

        await db.flush()
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(500, detail=f"Error durante la importación; no se guardó nada (se revirtió todo). Detalle: {e}")

    results["ok"] = results["creados"] + results["actualizados"]
    return results


# ── PATCH /{id} ── Actualizar proveedor (solo admin) ─────────────
@router.patch(
    "/{proveedor_id}",
    response_model=ProveedorResponse,
    summary="Actualizar proveedor (admin)",
)
async def actualizar_proveedor(
    proveedor_id: int,
    data: ProveedorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_admin(current_user)

    p = await db.get(Proveedor, proveedor_id)
    if not p:
        raise HTTPException(404, detail="Proveedor no encontrado.")

    for campo, valor in data.model_dump(exclude_none=True).items():
        setattr(p, campo, valor)

    await db.flush()
    await db.refresh(p)
    return p


# ── DELETE /{id} ── Desactivar proveedor (solo admin) ─────────────
@router.delete(
    "/{proveedor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Desactivar proveedor (admin)",
)
async def desactivar_proveedor(
    proveedor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    No elimina físicamente el proveedor (para preservar historial).
    Marca el proveedor como inactivo (soft delete).
    """
    _require_admin(current_user)

    p = await db.get(Proveedor, proveedor_id)
    if not p:
        raise HTTPException(404, detail="Proveedor no encontrado.")

    p.activo = False
    await db.flush()
