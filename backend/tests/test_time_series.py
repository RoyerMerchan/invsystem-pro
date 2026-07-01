"""
Tests unitarios para los modelos de series de tiempo.
Correr con: pytest tests/ -v
"""
import pytest
import numpy as np
from datetime import date, timedelta

from app.services.time_series import (
    proyectar_holt_winters,
    proyectar_arima,
    proyectar_prophet,
    seleccionar_mejor_modelo,
    ProyeccionResultado,
)


def _serie_sintetica(n: int = 60, base: float = 5.0, seed: int = 42) -> list[float]:
    rng = np.random.default_rng(seed)
    tendencia = np.linspace(0, 1, n)
    estacional = np.sin(np.arange(n) * 2 * np.pi / 7)
    ruido = rng.normal(0, 0.5, n)
    serie = base + tendencia * 2 + estacional + ruido
    return list(np.maximum(0, serie))


def _fechas(n: int = 60) -> list[date]:
    return [date.today() - timedelta(days=n - i) for i in range(n)]


# ── Holt-Winters ────────────────────────────────────────────────
class TestHoltWinters:
    def test_proyeccion_basica(self):
        serie = _serie_sintetica()
        r = proyectar_holt_winters(serie, stock_actual=50, stock_minimo=10, horizonte=30)
        assert r.modelo == "Holt-Winters (ETS)"
        assert len(r.puntos) == 30
        assert all(p.valor >= 0 for p in r.puntos)
        assert all(p.lower_95 <= p.valor <= p.upper_95 for p in r.puntos)

    def test_metricas_presentes(self):
        serie = _serie_sintetica()
        r = proyectar_holt_winters(serie, stock_actual=50, stock_minimo=10)
        assert r.metricas is not None
        assert r.metricas.mae >= 0
        assert r.metricas.rmse >= 0
        assert 0 <= r.metricas.mape

    def test_agotamiento_detectado(self):
        # Stock bajo + consumo alto → debe detectar agotamiento
        serie = [10.0] * 60  # consumo constante de 10/día
        r = proyectar_holt_winters(serie, stock_actual=50, stock_minimo=5, horizonte=30)
        assert r.dias_hasta_agotamiento is not None
        assert r.dias_hasta_agotamiento <= 30

    def test_serie_corta_advertencia(self):
        serie = _serie_sintetica(n=10)
        r = proyectar_holt_winters(serie, stock_actual=20, stock_minimo=5)
        assert len(r.advertencias) > 0

    def test_reposicion_calculada(self):
        serie = [5.0] * 60
        r = proyectar_holt_winters(serie, stock_actual=10, stock_minimo=5, horizonte=30)
        assert r.reposicion_recomendada >= 0


# ── ARIMA ───────────────────────────────────────────────────────
class TestARIMA:
    def test_proyeccion_basica(self):
        serie = _serie_sintetica()
        r = proyectar_arima(serie, stock_actual=50, stock_minimo=10, horizonte=30)
        assert "ARIMA" in r.modelo
        assert len(r.puntos) == 30
        assert all(p.valor >= 0 for p in r.puntos)

    def test_ic_coherente(self):
        serie = _serie_sintetica()
        r = proyectar_arima(serie, stock_actual=50, stock_minimo=10)
        for p in r.puntos:
            assert p.lower_95 <= p.upper_95

    def test_aic_presente(self):
        serie = _serie_sintetica()
        r = proyectar_arima(serie, stock_actual=50, stock_minimo=10)
        assert r.metricas is not None
        assert r.metricas.aic is not None

    def test_serie_muy_corta(self):
        serie = [3.0, 2.0, 4.0, 1.0, 5.0]
        r = proyectar_arima(serie, stock_actual=20, stock_minimo=5)
        assert len(r.advertencias) > 0
        assert len(r.puntos) == 30  # igual devuelve proyección


# ── Prophet ─────────────────────────────────────────────────────
class TestProphet:
    def test_proyeccion_basica(self):
        serie = _serie_sintetica()
        fechas = _fechas()
        r = proyectar_prophet(serie, fechas, stock_actual=50, stock_minimo=10, horizonte=30)
        assert r.modelo == "Prophet (Meta)"
        assert len(r.puntos) == 30
        assert all(p.valor >= 0 for p in r.puntos)

    def test_fechas_correctas(self):
        serie = _serie_sintetica()
        fechas = _fechas()
        r = proyectar_prophet(serie, fechas, stock_actual=50, stock_minimo=10, horizonte=7)
        assert r.puntos[0].fecha >= date.today()

    def test_advertencia_serie_corta(self):
        serie = _serie_sintetica(n=10)
        fechas = _fechas(n=10)
        r = proyectar_prophet(serie, fechas, stock_actual=20, stock_minimo=5)
        assert len(r.advertencias) > 0


# ── Selector automático ─────────────────────────────────────────
class TestSelectorAutomatico:
    def test_elige_menor_mape(self):
        from app.services.time_series import MetricasModelo, ProyeccionResultado
        r1 = ProyeccionResultado(modelo="A", horizonte_dias=30, metricas=MetricasModelo(mae=2, rmse=3, mape=10))
        r2 = ProyeccionResultado(modelo="B", horizonte_dias=30, metricas=MetricasModelo(mae=1, rmse=2, mape=5))
        r3 = ProyeccionResultado(modelo="C", horizonte_dias=30, metricas=MetricasModelo(mae=3, rmse=4, mape=15))
        mejor = seleccionar_mejor_modelo([r1, r2, r3])
        assert mejor.modelo == "B"

    def test_fallback_sin_metricas(self):
        r = ProyeccionResultado(modelo="Solo", horizonte_dias=30)
        mejor = seleccionar_mejor_modelo([r])
        assert mejor.modelo == "Solo"
