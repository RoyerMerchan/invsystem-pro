"""
Servicio de Series de Tiempo para proyecciones de inventario.

Modelos implementados:
  - Holt-Winters (ETS): Triple exponential smoothing con tendencia y estacionalidad
  - ARIMA: AutoRegressive Integrated Moving Average
  - Prophet: Modelo aditivo de Facebook (tendencia + estacionalidad + festivos)

Cada modelo expone el mismo contrato: recibe una serie histórica de consumo
diario y devuelve un ProyeccionResultado con valores proyectados, IC al 95%
y métricas de error (MAE, RMSE, MAPE).
"""
from __future__ import annotations

import warnings
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Literal

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error

warnings.filterwarnings("ignore")


# ── Tipos de salida ────────────────────────────────────────────
@dataclass
class PuntoProyeccion:
    fecha: date
    valor: float
    lower_95: float
    upper_95: float


@dataclass
class MetricasModelo:
    mae: float        # Error absoluto medio
    rmse: float       # Raíz del error cuadrático medio
    mape: float       # Error porcentual absoluto medio
    aic: float | None = None


@dataclass
class ProyeccionResultado:
    modelo: str
    horizonte_dias: int
    puntos: list[PuntoProyeccion] = field(default_factory=list)
    metricas: MetricasModelo | None = None
    dias_hasta_agotamiento: int | None = None
    fecha_agotamiento: date | None = None
    reposicion_recomendada: int = 0
    advertencias: list[str] = field(default_factory=list)


# ── Utilidades compartidas ────────────────────────────────────
def _calcular_agotamiento(stock_actual: int, proyeccion: list[float]) -> tuple[int | None, date | None]:
    acumulado = stock_actual
    for i, consumo in enumerate(proyeccion):
        acumulado -= max(0, consumo)
        if acumulado <= 0:
            return i + 1, date.today() + timedelta(days=i + 1)
    return None, None


def _rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.sqrt(np.mean((y_true - y_pred) ** 2)))


def _mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    mask = y_true != 0
    if not mask.any():
        return 0.0
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100)


# ── Modelo 1: Holt-Winters (ETS) ──────────────────────────────
def proyectar_holt_winters(
    serie: list[float],
    stock_actual: int,
    stock_minimo: int,
    horizonte: int = 30,
    periodo_estacional: int = 7,
) -> ProyeccionResultado:
    """
    Triple Exponential Smoothing (Holt-Winters).
    Ideal cuando la demanda tiene patrón semanal estacional.
    """
    from statsmodels.tsa.holtwinters import ExponentialSmoothing

    advertencias = []
    y = np.array(serie, dtype=float)

    if len(y) < periodo_estacional * 2:
        advertencias.append(f"Serie corta ({len(y)} obs). Se recomienda al menos {periodo_estacional * 2} puntos.")
        periodo_estacional = None  # desactivar estacionalidad
        trend_type = "add"
        seasonal_type = None
    else:
        trend_type = "add"
        seasonal_type = "add"

    # Ajustar modelo con validación (leave-last-N-out)
    n_val = min(7, len(y) // 4)
    y_train, y_val = y[:-n_val], y[-n_val:]

    model = ExponentialSmoothing(
        y_train,
        trend=trend_type,
        seasonal=seasonal_type,
        seasonal_periods=periodo_estacional,
        initialization_method="estimated",
    )
    fit = model.fit(optimized=True)

    val_pred = fit.forecast(n_val)
    metricas = MetricasModelo(
        mae=float(mean_absolute_error(y_val, val_pred)),
        rmse=_rmse(y_val, val_pred),
        mape=_mape(y_val, val_pred),
        aic=float(fit.aic) if hasattr(fit, "aic") else None,
    )

    # Re-entrenar con toda la serie
    model_full = ExponentialSmoothing(
        y,
        trend=trend_type,
        seasonal=seasonal_type,
        seasonal_periods=periodo_estacional,
        initialization_method="estimated",
    )
    fit_full = model_full.fit(optimized=True)
    forecast_vals = fit_full.forecast(horizonte)

    # IC 95% usando residuos del modelo de entrenamiento
    residuos_std = float(np.std(fit_full.resid))
    z95 = 1.96

    puntos = []
    for i, val in enumerate(forecast_vals):
        val = max(0.0, float(val))
        spread = z95 * residuos_std * np.sqrt(i + 1)
        puntos.append(PuntoProyeccion(
            fecha=date.today() + timedelta(days=i + 1),
            valor=round(val, 2),
            lower_95=round(max(0.0, val - spread), 2),
            upper_95=round(val + spread, 2),
        ))

    consumo_proyectado = [p.valor for p in puntos]
    dias_agot, fecha_agot = _calcular_agotamiento(stock_actual, consumo_proyectado)
    consumo_30d = sum(consumo_proyectado[:30])
    reposicion = max(0, int(consumo_30d) - stock_actual + stock_minimo)

    return ProyeccionResultado(
        modelo="Holt-Winters (ETS)",
        horizonte_dias=horizonte,
        puntos=puntos,
        metricas=metricas,
        dias_hasta_agotamiento=dias_agot,
        fecha_agotamiento=fecha_agot,
        reposicion_recomendada=reposicion,
        advertencias=advertencias,
    )


# ── Modelo 2: ARIMA ───────────────────────────────────────────
def proyectar_arima(
    serie: list[float],
    stock_actual: int,
    stock_minimo: int,
    horizonte: int = 30,
    order: tuple[int, int, int] = (2, 1, 2),
) -> ProyeccionResultado:
    """
    ARIMA(p,d,q) — AutoRegressive Integrated Moving Average.
    Captura autocorrelaciones en la demanda pasada.
    """
    from statsmodels.tsa.arima.model import ARIMA

    advertencias = []
    y = np.array(serie, dtype=float)

    if len(y) < 10:
        advertencias.append("Serie muy corta para ARIMA. Se necesitan al menos 10 observaciones.")
        order = (1, 0, 0)

    n_val = min(7, len(y) // 4)
    y_train, y_val = y[:-n_val], y[-n_val:]

    try:
        fit_val = ARIMA(y_train, order=order).fit()
        val_pred = fit_val.forecast(n_val)
    except Exception:
        order = (1, 1, 0)
        fit_val = ARIMA(y_train, order=order).fit()
        val_pred = fit_val.forecast(n_val)
        advertencias.append(f"Orden ajustado automáticamente a ARIMA{order}.")

    metricas = MetricasModelo(
        mae=float(mean_absolute_error(y_val, val_pred)),
        rmse=_rmse(y_val, val_pred),
        mape=_mape(y_val, val_pred),
        aic=float(fit_val.aic),
    )

    fit_full = ARIMA(y, order=order).fit()
    forecast_result = fit_full.get_forecast(horizonte)
    fc_mean = np.asarray(forecast_result.predicted_mean).flatten()
    fc_ci   = np.asarray(forecast_result.conf_int(alpha=0.05))

    puntos = []
    for i in range(horizonte):
        val = max(0.0, float(fc_mean[i]))
        lo  = max(0.0, float(fc_ci[i, 0])) if fc_ci.ndim == 2 else 0.0
        hi  = max(val, float(fc_ci[i, 1])) if fc_ci.ndim == 2 else val * 1.2
        puntos.append(PuntoProyeccion(
            fecha=date.today() + timedelta(days=i + 1),
            valor=round(val, 2),
            lower_95=round(lo, 2),
            upper_95=round(hi, 2),
        ))

    consumo_proyectado = [p.valor for p in puntos]
    dias_agot, fecha_agot = _calcular_agotamiento(stock_actual, consumo_proyectado)
    reposicion = max(0, int(sum(consumo_proyectado[:30])) - stock_actual + stock_minimo)

    return ProyeccionResultado(
        modelo=f"ARIMA{order}",
        horizonte_dias=horizonte,
        puntos=puntos,
        metricas=metricas,
        dias_hasta_agotamiento=dias_agot,
        fecha_agotamiento=fecha_agot,
        reposicion_recomendada=reposicion,
        advertencias=advertencias,
    )


# ── Modelo 3: Prophet ─────────────────────────────────────────
def proyectar_prophet(
    serie: list[float],
    fechas: list[date],
    stock_actual: int,
    stock_minimo: int,
    horizonte: int = 30,
) -> ProyeccionResultado:
    """
    Facebook Prophet — modelo aditivo con tendencia + estacionalidad + festivos.
    Robusto ante datos faltantes y cambios de tendencia.
    """
    from prophet import Prophet

    advertencias = []

    df = pd.DataFrame({
        "ds": pd.to_datetime(fechas),
        "y": [max(0.0, float(v)) for v in serie],
    })

    if len(df) < 14:
        advertencias.append("Se recomiendan al menos 14 días de historial para Prophet.")

    n_val = min(7, len(df) // 4)
    train_df = df.iloc[:-n_val]
    val_df = df.iloc[-n_val:]

    model = Prophet(
        yearly_seasonality=False,
        weekly_seasonality=len(df) >= 14,
        daily_seasonality=False,
        interval_width=0.95,
        changepoint_prior_scale=0.05,
    )
    model.fit(train_df)

    val_future = model.make_future_dataframe(periods=n_val, freq="D")
    val_forecast = model.predict(val_future)
    val_pred = val_forecast["yhat"].iloc[-n_val:].values
    y_val = val_df["y"].values

    metricas = MetricasModelo(
        mae=float(mean_absolute_error(y_val, val_pred)),
        rmse=_rmse(y_val, val_pred),
        mape=_mape(y_val, val_pred),
    )

    model_full = Prophet(
        yearly_seasonality=False,
        weekly_seasonality=len(df) >= 14,
        daily_seasonality=False,
        interval_width=0.95,
        changepoint_prior_scale=0.05,
    )
    model_full.fit(df)
    future = model_full.make_future_dataframe(periods=horizonte, freq="D")
    forecast = model_full.predict(future)
    fc = forecast.iloc[-horizonte:]

    puntos = []
    for _, row in fc.iterrows():
        val = max(0.0, float(row["yhat"]))
        puntos.append(PuntoProyeccion(
            fecha=row["ds"].date(),
            valor=round(val, 2),
            lower_95=round(max(0.0, float(row["yhat_lower"])), 2),
            upper_95=round(float(row["yhat_upper"]), 2),
        ))

    consumo_proyectado = [p.valor for p in puntos]
    dias_agot, fecha_agot = _calcular_agotamiento(stock_actual, consumo_proyectado)
    reposicion = max(0, int(sum(consumo_proyectado[:30])) - stock_actual + stock_minimo)

    return ProyeccionResultado(
        modelo="Prophet (Meta)",
        horizonte_dias=horizonte,
        puntos=puntos,
        metricas=metricas,
        dias_hasta_agotamiento=dias_agot,
        fecha_agotamiento=fecha_agot,
        reposicion_recomendada=reposicion,
        advertencias=advertencias,
    )


# ── Modelo 4: Promedio Móvil Simple ────────────────────────────
def proyectar_promedio_movil(
    serie: list[float],
    stock_actual: int,
    stock_minimo: int,
    horizonte: int = 30,
    ventana: int = 7,
) -> ProyeccionResultado:
    """
    Promedio Móvil Simple — proyecta usando el promedio de los últimos N días.
    Ideal para demanda estable sin tendencia marcada ni estacionalidad.
    """
    advertencias = []
    y = np.array(serie, dtype=float)

    if len(y) < ventana:
        advertencias.append(f"Serie corta ({len(y)} obs). Usando ventana de {len(y)} días.")
        ventana = max(1, len(y))

    n_val = min(7, len(y) // 4)
    y_train, y_val = y[:-n_val], y[-n_val:]

    # Validación
    if len(y_train) >= ventana:
        val_pred = np.full(n_val, float(np.mean(y_train[-ventana:])))
    else:
        val_pred = np.full(n_val, float(np.mean(y_train)))
    metricas = MetricasModelo(
        mae=float(mean_absolute_error(y_val, val_pred)),
        rmse=_rmse(y_val, val_pred),
        mape=_mape(y_val, val_pred),
    )

    # Proyección full
    media = float(np.mean(y[-ventana:]))
    forecast_vals = np.full(horizonte, media)
    residuos_std = float(np.std(y[-ventana:]))
    z95 = 1.96

    puntos = []
    for i, val in enumerate(forecast_vals):
        val = max(0.0, val)
        spread = z95 * residuos_std * np.sqrt(i + 1)
        puntos.append(PuntoProyeccion(
            fecha=date.today() + timedelta(days=i + 1),
            valor=round(val, 2),
            lower_95=round(max(0.0, val - spread), 2),
            upper_95=round(val + spread, 2),
        ))

    consumo_proyectado = [p.valor for p in puntos]
    dias_agot, fecha_agot = _calcular_agotamiento(stock_actual, consumo_proyectado)
    reposicion = max(0, int(sum(consumo_proyectado[:30])) - stock_actual + stock_minimo)

    return ProyeccionResultado(
        modelo=f"Promedio Móvil (ventana={ventana})",
        horizonte_dias=horizonte,
        puntos=puntos,
        metricas=metricas,
        dias_hasta_agotamiento=dias_agot,
        fecha_agotamiento=fecha_agot,
        reposicion_recomendada=reposicion,
        advertencias=advertencias,
    )


# ── Modelo 5: Suavización Exponencial Simple ──────────────────
def proyectar_suavizacion_simple(
    serie: list[float],
    stock_actual: int,
    stock_minimo: int,
    horizonte: int = 30,
    alpha: float = 0.3,
) -> ProyeccionResultado:
    """
    Suavización Exponencial Simple — ponderación exponencial de obs pasadas.
    Adecuado para demanda sin tendencia ni estacionalidad marcadas.
    """
    advertencias = []
    y = np.array(serie, dtype=float)

    if len(y) < 4:
        advertencias.append(f"Serie muy corta ({len(y)} obs). Se necesitan al menos 4.")

    n_val = min(7, len(y) // 4)
    y_train, y_val = y[:-n_val], y[-n_val:]

    # Validación con suavización
    def _suavizar(arr: np.ndarray, a: float) -> np.ndarray:
        s = np.zeros_like(arr)
        s[0] = arr[0]
        for i in range(1, len(arr)):
            s[i] = a * arr[i] + (1 - a) * s[i - 1]
        return s

    s_train = _suavizar(y_train, alpha)
    ultimo_nivel = s_train[-1]
    val_pred = np.full(n_val, ultimo_nivel)

    metricas = MetricasModelo(
        mae=float(mean_absolute_error(y_val, val_pred)),
        rmse=_rmse(y_val, val_pred),
        mape=_mape(y_val, val_pred),
    )

    # Proyección full
    s_full = _suavizar(y, alpha)
    nivel = s_full[-1]
    forecast_vals = np.full(horizonte, nivel)

    residuos_std = float(np.std(y - _suavizar(y, alpha)))
    z95 = 1.96

    puntos = []
    for i, val in enumerate(forecast_vals):
        val = max(0.0, val)
        spread = z95 * residuos_std * np.sqrt(i + 1)
        puntos.append(PuntoProyeccion(
            fecha=date.today() + timedelta(days=i + 1),
            valor=round(val, 2),
            lower_95=round(max(0.0, val - spread), 2),
            upper_95=round(val + spread, 2),
        ))

    consumo_proyectado = [p.valor for p in puntos]
    dias_agot, fecha_agot = _calcular_agotamiento(stock_actual, consumo_proyectado)
    reposicion = max(0, int(sum(consumo_proyectado[:30])) - stock_actual + stock_minimo)

    return ProyeccionResultado(
        modelo=f"Suavización Simple (α={alpha})",
        horizonte_dias=horizonte,
        puntos=puntos,
        metricas=metricas,
        dias_hasta_agotamiento=dias_agot,
        fecha_agotamiento=fecha_agot,
        reposicion_recomendada=reposicion,
        advertencias=advertencias,
    )


# ── Modelo 6: Tendencia Lineal ───────────────────────────────
def proyectar_tendencia_lineal(
    serie: list[float],
    fechas: list[date],
    stock_actual: int,
    stock_minimo: int,
    horizonte: int = 30,
) -> ProyeccionResultado:
    """
    Tendencia Lineal — regresión lineal simple sobre tiempo.
    Captura tendencias crecientes o decrecientes de largo plazo.
    """
    advertencias = []
    y = np.array(serie, dtype=float)
    n = len(y)

    if n < 4:
        advertencias.append(f"Serie muy corta ({n} obs). Se necesitan al menos 4.")

    # Días desde el inicio como X
    x = np.arange(n, dtype=float)
    X = np.column_stack([np.ones(n), x])

    n_val = min(7, n // 4)
    if n_val < 1:
        n_val = 1

    y_train, y_val = y[:-n_val], y[-n_val:]

    def _regresion(x_train: np.ndarray, y_train: np.ndarray) -> tuple[float, float]:
        Xt = np.column_stack([np.ones(len(x_train)), x_train])
        try:
            coef = np.linalg.lstsq(Xt, y_train, rcond=None)[0]
        except np.linalg.LinAlgError:
            coef = np.array([float(np.mean(y_train)), 0.0])
        return float(coef[0]), float(coef[1])

    # Validación
    x_train = np.arange(len(y_train), dtype=float)
    intercept, slope = _regresion(x_train, y_train)
    x_val = np.arange(len(y_train), len(y_train) + n_val, dtype=float)
    val_pred = intercept + slope * x_val
    val_pred = np.maximum(0, val_pred)

    metricas = MetricasModelo(
        mae=float(mean_absolute_error(y_val, val_pred)),
        rmse=_rmse(y_val, val_pred),
        mape=_mape(y_val, val_pred),
    )

    # Proyección full
    intercept_f, slope_f = _regresion(x, y)
    x_full = np.arange(n + horizonte, dtype=float)
    fc = intercept_f + slope_f * x_full
    fc = np.maximum(0, fc)
    forecast_vals = fc[-horizonte:]

    residuos = y - (intercept_f + slope_f * x)
    residuos_std = float(np.std(residuos))
    z95 = 1.96

    puntos = []
    for i, val in enumerate(forecast_vals):
        val = max(0.0, float(val))
        spread = z95 * residuos_std * np.sqrt(i + 1)
        puntos.append(PuntoProyeccion(
            fecha=date.today() + timedelta(days=i + 1),
            valor=round(val, 2),
            lower_95=round(max(0.0, val - spread), 2),
            upper_95=round(val + spread, 2),
        ))

    consumo_proyectado = [p.valor for p in puntos]
    dias_agot, fecha_agot = _calcular_agotamiento(stock_actual, consumo_proyectado)
    reposicion = max(0, int(sum(consumo_proyectado[:30])) - stock_actual + stock_minimo)
    pendiente = f"{slope_f:+.3f}" if slope_f != 0 else "estable"
    advertencias.append(f"Tendencia: {pendiente} uds/día")

    r2 = 1 - np.sum(residuos**2) / np.sum((y - np.mean(y))**2) if np.sum((y - np.mean(y))**2) > 0 else 0
    if abs(slope_f) > 0:
        dir_ = "creciente" if slope_f > 0 else "decreciente"
        advertencias.append(f"Demanda {dir_} (R²={r2:.2f})")

    return ProyeccionResultado(
        modelo="Tendencia Lineal",
        horizonte_dias=horizonte,
        puntos=puntos,
        metricas=metricas,
        dias_hasta_agotamiento=dias_agot,
        fecha_agotamiento=fecha_agot,
        reposicion_recomendada=reposicion,
        advertencias=advertencias,
    )


# ── Selector automático de modelo ────────────────────────────
def seleccionar_mejor_modelo(resultados: list[ProyeccionResultado]) -> ProyeccionResultado:
    """Devuelve el modelo con menor MAPE (mejor ajuste relativo)."""
    validos = [r for r in resultados if r.metricas is not None]
    if not validos:
        return resultados[0]
    return min(validos, key=lambda r: r.metricas.mape)
