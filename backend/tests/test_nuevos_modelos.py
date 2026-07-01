"""Tests para los nuevos modelos de proyección (Fase 4)"""
import pytest
import numpy as np
from datetime import date
from app.services.time_series import (
    proyectar_promedio_movil,
    proyectar_suavizacion_simple,
    proyectar_tendencia_lineal,
)


def _serie(n=60, base=10, seed=42):
    rng = np.random.default_rng(seed)
    t = np.arange(n)
    return list(np.maximum(0, base + 0.05 * t + rng.normal(0, 2, n)).astype(float))


class TestPromedioMovil:
    def test_proyeccion_basica(self):
        serie = _serie()
        r = proyectar_promedio_movil(serie, 100, 10, 30)
        assert len(r.puntos) == 30
        assert all(p.valor >= 0 for p in r.puntos)
        assert all(p.lower_95 <= p.upper_95 for p in r.puntos)
        assert r.modelo.startswith("Promedio Móvil")

    def test_metricas_presentes(self):
        r = proyectar_promedio_movil(_serie(), 100, 10, 30)
        assert r.metricas is not None
        assert r.metricas.mae >= 0
        assert r.metricas.rmse >= 0
        assert r.metricas.mape >= 0

    def test_agotamiento_detectado(self):
        r = proyectar_promedio_movil(_serie(base=20), 5, 10, 30)
        assert r.dias_hasta_agotamiento is not None
        assert r.reposicion_recomendada > 0

    def test_serie_corta(self):
        r = proyectar_promedio_movil([1, 2, 3, 4, 5, 6], 100, 10, 10)
        assert len(r.puntos) == 10
        assert len(r.advertencias) > 0


class TestSuavizacionSimple:
    def test_proyeccion_basica(self):
        r = proyectar_suavizacion_simple(_serie(), 100, 10, 30)
        assert len(r.puntos) == 30
        assert r.modelo.startswith("Suavización Simple")
        assert all(p.lower_95 <= p.upper_95 for p in r.puntos)

    def test_metricas(self):
        r = proyectar_suavizacion_simple(_serie(base=5), 50, 5, 20)
        assert r.metricas is not None
        assert r.metricas.mape >= 0

    def test_alpha_personalizado(self):
        r = proyectar_suavizacion_simple(_serie(), 100, 10, 30, alpha=0.5)
        assert len(r.puntos) == 30


class TestTendenciaLineal:
    def test_proyeccion_basica(self):
        fechas = [date(2025, 1, 1) + __import__('datetime').timedelta(days=i) for i in range(60)]
        r = proyectar_tendencia_lineal(_serie(base=5), fechas, 100, 10, 30)
        assert len(r.puntos) == 30
        assert r.modelo == "Tendencia Lineal"
        assert all(p.valor >= 0 for p in r.puntos)

    def test_tendencia_advertencia(self):
        fechas = [date(2025, 1, 1) + __import__('datetime').timedelta(days=i) for i in range(60)]
        r = proyectar_tendencia_lineal(_serie(base=20), fechas, 100, 10, 30)
        tendencias = [a for a in r.advertencias if "Tendencia" in a or "creciente" in a or "decreciente" in a]
        assert len(tendencias) > 0

    def test_serie_muy_corta(self):
        fechas = [date(2025, 1, 1) + __import__('datetime').timedelta(days=i) for i in range(3)]
        r = proyectar_tendencia_lineal([1, 2, 3], fechas, 100, 10, 10)
        assert len(r.puntos) == 10
