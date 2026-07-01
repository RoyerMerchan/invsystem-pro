"""
Router: /api/v1/proyecciones
Endpoints para proyecciones de series de tiempo con XAI.
"""
import json
import logging
import traceback
from datetime import date, datetime, timedelta
from typing import Literal

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Producto, Movimiento, ProyeccionGuardada, Usuario
from app.routers.auth import get_current_user
from app.services.time_series import (
    proyectar_holt_winters,
    proyectar_arima,
    proyectar_prophet,
    proyectar_promedio_movil,
    proyectar_suavizacion_simple,
    proyectar_tendencia_lineal,
    seleccionar_mejor_modelo,
    ProyeccionResultado,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Schemas ──────────────────────────────────────────────────────
class SolicitudProyeccion(BaseModel):
    producto_id: int
    horizonte_dias: int = Field(default=30, ge=7, le=180)
    modelo: Literal["promedio_movil", "suavizacion_simple", "tendencia_lineal", "holt_winters", "arima", "prophet", "auto"] = "auto"
    rango_desde: str | None = None
    rango_hasta: str | None = None
    agrupacion: Literal["diaria", "semanal", "mensual"] = "diaria"


class PuntoSchema(BaseModel):
    fecha: date
    valor: float
    lower_95: float
    upper_95: float


class MetricasSchema(BaseModel):
    mae: float
    rmse: float
    mape: float
    aic: float | None


class ProyeccionResponse(BaseModel):
    producto_id: int
    producto_nombre: str
    stock_actual: int
    stock_minimo: int
    modelo_usado: str
    horizonte_dias: int
    puntos: list[PuntoSchema]
    metricas: MetricasSchema | None
    dias_hasta_agotamiento: int | None
    fecha_agotamiento: date | None
    reposicion_recomendada: int
    advertencias: list[str]
    comparacion_modelos: list[dict] | None = None
    guardado_id: int | None = None


class ProyeccionHistorialItem(BaseModel):
    id: int
    producto_id: int
    producto_nombre: str = ""
    modelo_utilizado: str
    horizonte_dias: int
    reposicion_recomendada: int
    dias_agotamiento: int | None
    creado_en: datetime
    creado_por_nombre: str = ""


class ProyeccionComparacion(BaseModel):
    proyeccion_id: int
    producto_id: int
    producto_nombre: str
    modelo_usado: str
    demanda_proyectada: float
    demanda_real: float
    diferencia: float
    error_absoluto: float
    porcentaje_error: float
    precision: float


class FactorSchema(BaseModel):
    nombre: str
    impacto: float
    valor: str
    descripcion: str
    icono: str


class PatronSchema(BaseModel):
    tipo: str
    descripcion: str
    magnitud: float
    icono: str


class ExplicacionResponse(BaseModel):
    resumen: str
    confianza: float
    nivel_confianza: str
    color_confianza: str
    factores: list[FactorSchema]
    patrones: list[PatronSchema]
    razonamiento: list[str]
    recomendacion: str
    datos_historicos_dias: int
    consumo_promedio_diario: float
    tendencia_7d: float
    tendencia_30d: float
    dia_semana_pico: str
    variabilidad: str
    proyeccion: ProyeccionResponse


# ── Helper: obtener serie de consumo ─────────────────────────────
async def _obtener_serie_consumo(
    producto_id: int,
    db: AsyncSession,
    dias: int = 90,
    desde: date | None = None,
    hasta: date | None = None,
    agrupacion: str = "diaria",
) -> tuple[list[float], list[date]]:
    if desde is None:
        desde = date.today() - timedelta(days=dias)
    if hasta is None:
        hasta = date.today()

    stmt = (
        select(Movimiento)
        .where(
            Movimiento.producto_id == producto_id,
            Movimiento.fecha >= desde,
            Movimiento.fecha <= hasta + timedelta(days=1),
        )
        .order_by(Movimiento.fecha)
    )
    result = await db.execute(stmt)
    movs = result.scalars().all()

    diario: dict[date, float] = {}
    for mov in movs:
        d = mov.fecha.date() if hasattr(mov.fecha, "date") else mov.fecha
        if agrupacion == "semanal":
            d = d - timedelta(days=d.weekday())
        elif agrupacion == "mensual":
            d = date(d.year, d.month, 1)
        if mov.tipo == "salida":
            diario[d] = diario.get(d, 0) + mov.cantidad
        elif mov.tipo == "entrada":
            diario[d] = diario.get(d, 0) - mov.cantidad

    step = 1 if agrupacion == "diaria" else (7 if agrupacion == "semanal" else 30)
    fechas, valores = [], []
    d = desde
    while d <= hasta:
        fechas.append(d)
        valores.append(max(0.0, diario.get(d, 0.0)))
        if agrupacion == "mensual":
            m = d.month + 1
            y = d.year + (m - 1) // 12
            m = (m - 1) % 12 + 1
            d = date(y, m, 1)
        else:
            d += timedelta(days=step)

    return valores, fechas


def _serie_sintetica(producto_id: int, stock_actual: int) -> tuple[list[float], list[date]]:
    """Genera una serie sintética realista cuando no hay historial."""
    rng = np.random.default_rng(seed=producto_id)
    base = max(1.0, stock_actual / 20)
    # Tendencia leve + estacionalidad semanal + ruido
    dias = 60
    t = np.arange(dias)
    tendencia = base + 0.02 * t
    estacional = 0.3 * base * np.sin(2 * np.pi * t / 7)
    ruido = rng.normal(0, base * 0.15, dias)
    serie = list(np.maximum(0, tendencia + estacional + ruido).astype(float))
    fechas = [date.today() - timedelta(days=dias - i) for i in range(dias)]
    return serie, fechas


def _resultado_a_response(
    resultado: ProyeccionResultado,
    producto: Producto,
    comparacion: list[ProyeccionResultado] | None = None,
) -> ProyeccionResponse:
    comp = None
    if comparacion:
        comp = [
            {
                "modelo": r.modelo,
                "mae": round(r.metricas.mae, 3) if r.metricas else 0,
                "rmse": round(r.metricas.rmse, 3) if r.metricas else 0,
                "mape": round(r.metricas.mape, 2) if r.metricas else 0,
            }
            for r in comparacion
        ]
    return ProyeccionResponse(
        producto_id=producto.id,
        producto_nombre=producto.nombre,
        stock_actual=producto.stock_actual,
        stock_minimo=producto.stock_minimo,
        modelo_usado=resultado.modelo,
        horizonte_dias=resultado.horizonte_dias,
        puntos=[PuntoSchema(**p.__dict__) for p in resultado.puntos],
        metricas=MetricasSchema(**resultado.metricas.__dict__) if resultado.metricas else None,
        dias_hasta_agotamiento=resultado.dias_hasta_agotamiento,
        fecha_agotamiento=resultado.fecha_agotamiento,
        reposicion_recomendada=resultado.reposicion_recomendada,
        advertencias=resultado.advertencias,
        comparacion_modelos=comp,
    )


def _ejecutar_modelo(
    modelo: str, serie: list[float], fechas: list[date],
    stock: int, minimo: int, horizonte: int
) -> ProyeccionResultado:
    """Ejecuta un modelo individual con manejo de errores."""
    try:
        if modelo == "promedio_movil":
            return proyectar_promedio_movil(serie, stock, minimo, horizonte)
        elif modelo == "suavizacion_simple":
            return proyectar_suavizacion_simple(serie, stock, minimo, horizonte)
        elif modelo == "tendencia_lineal":
            return proyectar_tendencia_lineal(serie, fechas, stock, minimo, horizonte)
        elif modelo == "holt_winters":
            return proyectar_holt_winters(serie, stock, minimo, horizonte)
        elif modelo == "arima":
            return proyectar_arima(serie, stock, minimo, horizonte)
        elif modelo == "prophet":
            return proyectar_prophet(serie, fechas, stock, minimo, horizonte)
    except Exception as e:
        logger.error(f"Error en modelo {modelo}: {e}\n{traceback.format_exc()}")
        # Fallback: Holt-Winters es el más robusto
        try:
            r = proyectar_holt_winters(serie, stock, minimo, horizonte)
            r.advertencias.append(f"Modelo {modelo} falló ({type(e).__name__}), se usó Holt-Winters como respaldo.")
            return r
        except Exception as e2:
            logger.error(f"Fallback Holt-Winters también falló: {e2}")
            raise HTTPException(500, detail=f"Error ejecutando modelo {modelo}: {str(e)}")


# ── GET producto resumen ─────────────────────────────────────────
@router.get("/{producto_id}/resumen", summary="Resumen rápido de proyección")
async def resumen_proyeccion(
    producto_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    producto = await db.get(Producto, producto_id)
    if not producto:
        raise HTTPException(404, detail="Producto no encontrado")

    serie, _ = await _obtener_serie_consumo(producto_id, db)
    consumo_promedio = sum(serie[-30:]) / 30 if sum(serie) > 0 else max(1, producto.stock_actual // 30)
    dias_restantes = int(producto.stock_actual / consumo_promedio) if consumo_promedio > 0 else 999

    return {
        "producto_id": producto_id,
        "producto_nombre": producto.nombre,
        "stock_actual": producto.stock_actual,
        "consumo_promedio_diario": round(consumo_promedio, 2),
        "dias_stock_restante": dias_restantes,
        "fecha_estimada_agotamiento": date.today() + timedelta(days=dias_restantes),
        "alerta": dias_restantes < 14,
    }


# ── POST proyeccion ──────────────────────────────────────────────
@router.post("/", response_model=ProyeccionResponse, summary="Generar proyección de demanda")
async def generar_proyeccion(
    req: SolicitudProyeccion,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    producto = await db.get(Producto, req.producto_id)
    if not producto:
        raise HTTPException(404, detail="Producto no encontrado")

    desde = date.fromisoformat(req.rango_desde) if req.rango_desde else None
    hasta = date.fromisoformat(req.rango_hasta) if req.rango_hasta else None
    dias = 90 if not desde else (hasta - desde).days if hasta else 90
    if dias < 7:
        dias = 90

    serie, fechas = await _obtener_serie_consumo(req.producto_id, db, dias, desde, hasta, req.agrupacion)
    if sum(serie) == 0:
        serie, fechas = _serie_sintetica(req.producto_id, producto.stock_actual)

    stock, minimo, horizonte = producto.stock_actual, producto.stock_minimo, req.horizonte_dias

    try:
        if req.modelo == "auto":
            resultados = [
                _ejecutar_modelo("promedio_movil",     serie, fechas, stock, minimo, horizonte),
                _ejecutar_modelo("suavizacion_simple", serie, fechas, stock, minimo, horizonte),
                _ejecutar_modelo("tendencia_lineal",   serie, fechas, stock, minimo, horizonte),
                _ejecutar_modelo("holt_winters",       serie, fechas, stock, minimo, horizonte),
                _ejecutar_modelo("arima",              serie, fechas, stock, minimo, horizonte),
                _ejecutar_modelo("prophet",            serie, fechas, stock, minimo, horizonte),
            ]
            mejor = seleccionar_mejor_modelo(resultados)
            resp = _resultado_a_response(mejor, producto, comparacion=resultados)
        else:
            resultado = _ejecutar_modelo(req.modelo, serie, fechas, stock, minimo, horizonte)
            resp = _resultado_a_response(resultado, producto)

        # Guardar en BD
        guardado = ProyeccionGuardada(
            producto_id=producto.id,
            modelo_utilizado=resp.modelo_usado,
            horizonte_dias=horizonte,
            rango_desde=datetime.combine(desde, datetime.min.time()) if desde else None,
            rango_hasta=datetime.combine(hasta, datetime.min.time()) if hasta else None,
            agrupacion=req.agrupacion,
            parametros={"modelo_solicitado": req.modelo},
            puntos=json.dumps([p.__dict__ for p in (mejor if req.modelo == "auto" else resultado).puntos], default=str),
            metricas=json.dumps((mejor if req.modelo == "auto" else resultado).metricas.__dict__, default=str) if (mejor if req.modelo == "auto" else resultado).metricas else "{}",
            reposicion_recomendada=resp.reposicion_recomendada,
            dias_agotamiento=resp.dias_hasta_agotamiento,
            created_by_id=current_user.id,
        )
        db.add(guardado)
        await db.flush()
        resp.guardado_id = guardado.id

        return resp
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error inesperado en proyeccion: {e}\n{traceback.format_exc()}")
        raise HTTPException(500, detail=f"Error generando proyección: {str(e)}")


# ── GET /historial ───────────────────────────────────────────────
@router.get("/historial", response_model=list[ProyeccionHistorialItem], summary="Historial de proyecciones guardadas")
async def historial_proyecciones(
    producto_id: int | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    stmt = select(ProyeccionGuardada).order_by(desc(ProyeccionGuardada.creado_en))
    if producto_id:
        stmt = stmt.where(ProyeccionGuardada.producto_id == producto_id)
    stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    items = result.scalars().all()

    output = []
    for item in items:
        prod = await db.get(Producto, item.producto_id)
        user = await db.get(Usuario, item.created_by_id)
        output.append(ProyeccionHistorialItem(
            id=item.id,
            producto_id=item.producto_id,
            producto_nombre=prod.nombre if prod else "",
            modelo_utilizado=item.modelo_utilizado,
            horizonte_dias=item.horizonte_dias,
            reposicion_recomendada=item.reposicion_recomendada,
            dias_agotamiento=item.dias_agotamiento,
            creado_en=item.creado_en,
            creado_por_nombre=user.nombre if user else "",
        ))
    return output


# ── GET /comparacion ────────────────────────────────────────────
@router.get("/comparacion/{producto_id}", response_model=ProyeccionComparacion | None,
            summary="Comparar última proyección vs ventas reales")
async def comparar_proyeccion(
    producto_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    # Última proyección guardada para este producto
    stmt = (
        select(ProyeccionGuardada)
        .where(ProyeccionGuardada.producto_id == producto_id)
        .order_by(desc(ProyeccionGuardada.creado_en))
        .limit(1)
    )
    result = await db.execute(stmt)
    guardada = result.scalar_one_or_none()
    if not guardada:
        raise HTTPException(404, detail="No hay proyecciones guardadas para este producto.")

    desde = guardada.creado_en.date()
    hasta = desde + timedelta(days=guardada.horizonte_dias)

    # Ventas reales en el período proyectado
    ventas_serie, _ = await _obtener_serie_consumo(producto_id, db, guardada.horizonte_dias, desde, hasta)
    demanda_real = sum(ventas_serie)

    # Demanda proyectada
    try:
        puntos = json.loads(guardada.puntos) if isinstance(guardada.puntos, str) else guardada.puntos
        demanda_proyectada = sum(p.get("valor", 0) for p in (puntos if isinstance(puntos, list) else []))
    except (json.JSONDecodeError, TypeError):
        # Intentar parsear como dict con clave "puntos" o similar
        if isinstance(guardada.puntos, dict):
            puntos_list = guardada.puntos.get("puntos", [])
            demanda_proyectada = sum(p.get("valor", 0) for p in (puntos_list if isinstance(puntos_list, list) else []))
        else:
            demanda_proyectada = demanda_real

    diff = demanda_proyectada - demanda_real
    error_abs = abs(diff)
    porc_error = (error_abs / demanda_real * 100) if demanda_real > 0 else 0
    precision = max(0, 100 - porc_error)

    prod = await db.get(Producto, producto_id)
    return ProyeccionComparacion(
        proyeccion_id=guardada.id,
        producto_id=producto_id,
        producto_nombre=prod.nombre if prod else "",
        modelo_usado=guardada.modelo_utilizado,
        demanda_proyectada=round(demanda_proyectada, 2),
        demanda_real=round(demanda_real, 2),
        diferencia=round(diff, 2),
        error_absoluto=round(error_abs, 2),
        porcentaje_error=round(porc_error, 2),
        precision=round(precision, 2),
    )


# ── GET /{id} ── Obtener proyección guardada ────────────────────
@router.get("/{proyeccion_id}", summary="Obtener proyección guardada por ID")
async def obtener_proyeccion_guardada(
    proyeccion_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    guardada = await db.get(ProyeccionGuardada, proyeccion_id)
    if not guardada:
        raise HTTPException(404, detail="Proyección no encontrada.")
    return {
        "id": guardada.id,
        "producto_id": guardada.producto_id,
        "modelo_utilizado": guardada.modelo_utilizado,
        "horizonte_dias": guardada.horizonte_dias,
        "puntos": guardada.puntos,
        "metricas": guardada.metricas,
        "reposicion_recomendada": guardada.reposicion_recomendada,
        "dias_agotamiento": guardada.dias_agotamiento,
        "creado_en": str(guardada.creado_en),
    }


# ── POST XAI ─────────────────────────────────────────────────────
@router.post("/xai", response_model=ExplicacionResponse, summary="Proyección con explicación XAI")
async def proyeccion_con_xai(
    req: SolicitudProyeccion,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    from app.services.xai import generar_explicacion

    producto = await db.get(Producto, req.producto_id)
    if not producto:
        raise HTTPException(404, detail="Producto no encontrado")

    serie, fechas = await _obtener_serie_consumo(req.producto_id, db)
    if sum(serie) == 0:
        serie, fechas = _serie_sintetica(req.producto_id, producto.stock_actual)

    stock, minimo, horizonte = producto.stock_actual, producto.stock_minimo, req.horizonte_dias

    try:
        if req.modelo == "auto":
            resultados = [
                _ejecutar_modelo("promedio_movil",     serie, fechas, stock, minimo, horizonte),
                _ejecutar_modelo("suavizacion_simple", serie, fechas, stock, minimo, horizonte),
                _ejecutar_modelo("tendencia_lineal",   serie, fechas, stock, minimo, horizonte),
                _ejecutar_modelo("holt_winters",       serie, fechas, stock, minimo, horizonte),
                _ejecutar_modelo("arima",              serie, fechas, stock, minimo, horizonte),
                _ejecutar_modelo("prophet",            serie, fechas, stock, minimo, horizonte),
            ]
            resultado = seleccionar_mejor_modelo(resultados)
            proy_resp = _resultado_a_response(resultado, producto, comparacion=resultados)
        else:
            resultado = _ejecutar_modelo(req.modelo, serie, fechas, stock, minimo, horizonte)
            proy_resp = _resultado_a_response(resultado, producto)

        mape = resultado.metricas.mape if resultado.metricas else None
        total_proyectado = sum(p.valor for p in resultado.puntos)

        xai = generar_explicacion(
            serie=serie,
            fechas=fechas,
            modelo_usado=resultado.modelo,
            mape=mape,
            stock_actual=stock,
            stock_minimo=minimo,
            reposicion_recomendada=resultado.reposicion_recomendada,
            dias_hasta_agotamiento=resultado.dias_hasta_agotamiento,
            consumo_proyectado_total=total_proyectado,
            horizonte_dias=horizonte,
        )

        return ExplicacionResponse(
            resumen=xai.resumen,
            confianza=xai.confianza,
            nivel_confianza=xai.nivel_confianza,
            color_confianza=xai.color_confianza,
            factores=[FactorSchema(**f.__dict__) for f in xai.factores],
            patrones=[PatronSchema(**p.__dict__) for p in xai.patrones],
            razonamiento=xai.razonamiento,
            recomendacion=xai.recomendacion,
            datos_historicos_dias=xai.datos_historicos_dias,
            consumo_promedio_diario=xai.consumo_promedio_diario,
            tendencia_7d=xai.tendencia_7d,
            tendencia_30d=xai.tendencia_30d,
            dia_semana_pico=xai.dia_semana_pico,
            variabilidad=xai.variabilidad,
            proyeccion=proy_resp,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en XAI: {e}\n{traceback.format_exc()}")
        raise HTTPException(500, detail=f"Error en análisis XAI: {str(e)}")
