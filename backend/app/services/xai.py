"""
Servicio de IA Explicable (XAI) — InvSystem Pro
================================================
Genera explicaciones en lenguaje natural sobre por qué el modelo
predice lo que predice, detecta patrones en los datos históricos
y produce factores de influencia cuantificados.
"""
from __future__ import annotations
import numpy as np
from datetime import date, timedelta
from dataclasses import dataclass, field


@dataclass
class FactorInfluencia:
    nombre: str          # Nombre del factor
    impacto: float       # -1.0 a 1.0 (negativo = reduce demanda, positivo = aumenta)
    valor: str           # Valor legible para el usuario
    descripcion: str     # Explicación en lenguaje natural
    icono: str           # Emoji representativo


@dataclass
class PatronDetectado:
    tipo: str            # "tendencia" | "estacionalidad" | "anomalia" | "ciclo"
    descripcion: str
    magnitud: float      # 0-1 qué tan fuerte es el patrón
    icono: str


@dataclass
class ExplicacionXAI:
    resumen: str                              # Oración resumen principal
    confianza: float                          # 0-100 porcentaje de confianza
    nivel_confianza: str                      # "Alta" | "Media" | "Baja"
    color_confianza: str                      # Color hex
    factores: list[FactorInfluencia]          # Factores que influyen en la predicción
    patrones: list[PatronDetectado]           # Patrones detectados en el historial
    razonamiento: list[str]                   # Pasos de razonamiento (chain-of-thought)
    recomendacion: str                        # Acción concreta recomendada
    datos_historicos_dias: int                # Cuántos días de historial se usaron
    consumo_promedio_diario: float
    tendencia_7d: float                       # % cambio últimos 7 días vs semana anterior
    tendencia_30d: float                      # % cambio últimos 30 días vs mes anterior
    dia_semana_pico: str                      # Día de la semana con más demanda
    variabilidad: str                         # "Alta" | "Media" | "Baja"


def generar_explicacion(
    serie: list[float],
    fechas: list[date],
    modelo_usado: str,
    mape: float | None,
    stock_actual: int,
    stock_minimo: int,
    reposicion_recomendada: int,
    dias_hasta_agotamiento: int | None,
    consumo_proyectado_total: float,
    horizonte_dias: int,
) -> ExplicacionXAI:
    """
    Genera una explicación XAI completa para una proyección.
    Analiza el historial y produce factores de influencia cuantificados
    con lenguaje natural accesible para el usuario de negocio.
    """
    arr = np.array(serie, dtype=float)
    n = len(arr)

    # ── Estadísticas base ─────────────────────────────────────
    consumo_diario = float(np.mean(arr)) if n > 0 else 0.0
    std = float(np.std(arr)) if n > 0 else 0.0
    cv = (std / consumo_diario) if consumo_diario > 0 else 0.0  # coef. variación

    # Tendencia: compara segunda mitad vs primera mitad
    if n >= 14:
        mitad = n // 2
        primera = float(np.mean(arr[:mitad]))
        segunda = float(np.mean(arr[mitad:]))
        tendencia_global = ((segunda - primera) / primera * 100) if primera > 0 else 0.0
    else:
        tendencia_global = 0.0

    # Tendencia últimas 2 semanas
    if n >= 14:
        sem1 = float(np.mean(arr[-14:-7]))
        sem2 = float(np.mean(arr[-7:]))
        tendencia_7d = ((sem2 - sem1) / sem1 * 100) if sem1 > 0 else 0.0
    else:
        tendencia_7d = 0.0

    # Tendencia últimos 2 meses
    if n >= 60:
        mes1 = float(np.mean(arr[-60:-30]))
        mes2 = float(np.mean(arr[-30:]))
        tendencia_30d = ((mes2 - mes1) / mes1 * 100) if mes1 > 0 else 0.0
    elif n >= 14:
        tendencia_30d = tendencia_global
    else:
        tendencia_30d = 0.0

    # ── Estacionalidad semanal ────────────────────────────────
    dias_semana = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
    por_dia: dict[int, list[float]] = {i: [] for i in range(7)}
    for i, v in enumerate(arr):
        if fechas:
            dow = fechas[max(0, len(fechas) - n + i)].weekday() if i < len(fechas) else i % 7
        else:
            dow = i % 7
        por_dia[dow].append(v)

    promedios_dia = {d: (np.mean(vs) if vs else 0.0) for d, vs in por_dia.items()}
    pico_dow = max(promedios_dia, key=lambda d: promedios_dia[d])
    dia_pico_nombre = dias_semana[pico_dow]
    pico_valor = promedios_dia[pico_dow]
    factor_estacionalidad = ((pico_valor - consumo_diario) / consumo_diario) if consumo_diario > 0 else 0.0

    # ── Anomalías ─────────────────────────────────────────────
    umbral_anomalia = consumo_diario + 2 * std
    anomalias = int(np.sum(arr > umbral_anomalia)) if std > 0 else 0
    pct_anomalias = anomalias / n if n > 0 else 0.0

    # ── Variabilidad ──────────────────────────────────────────
    if cv < 0.3:
        variabilidad = "Baja"
        variabilidad_desc = "demanda estable y predecible"
    elif cv < 0.7:
        variabilidad = "Media"
        variabilidad_desc = "variabilidad moderada en la demanda"
    else:
        variabilidad = "Alta"
        variabilidad_desc = "demanda muy irregular"

    # ── Confianza del modelo ──────────────────────────────────
    confianza = _calcular_confianza(mape, n, cv)
    if confianza >= 75:
        nivel_confianza, color_confianza = "Alta", "#059669"
    elif confianza >= 50:
        nivel_confianza, color_confianza = "Media", "#D97706"
    else:
        nivel_confianza, color_confianza = "Baja", "#DC2626"

    # ── Factores de influencia ────────────────────────────────
    factores: list[FactorInfluencia] = []

    # Factor 1: Tendencia reciente
    if abs(tendencia_7d) > 5:
        factores.append(FactorInfluencia(
            nombre="Tendencia reciente",
            impacto=min(1.0, max(-1.0, tendencia_7d / 50)),
            valor=f"{tendencia_7d:+.1f}% vs semana anterior",
            descripcion=f"Las ventas de los últimos 7 días {'aumentaron' if tendencia_7d > 0 else 'disminuyeron'} {abs(tendencia_7d):.1f}% respecto a la semana previa.",
            icono="📈" if tendencia_7d > 0 else "📉",
        ))

    # Factor 2: Estacionalidad semanal
    if abs(factor_estacionalidad) > 0.1 and n >= 14:
        factores.append(FactorInfluencia(
            nombre="Estacionalidad semanal",
            impacto=min(1.0, factor_estacionalidad),
            valor=f"Pico en {dia_pico_nombre} ({pico_valor:.1f} u/día)",
            descripcion=f"Los {dia_pico_nombre} tienen {abs(factor_estacionalidad)*100:.0f}% {'más' if factor_estacionalidad > 0 else 'menos'} demanda que el promedio semanal.",
            icono="📅",
        ))

    # Factor 3: Variabilidad histórica
    factores.append(FactorInfluencia(
        nombre="Variabilidad histórica",
        impacto=-(cv * 0.5),  # Alta variabilidad reduce confianza negativamente
        valor=f"CV={cv:.2f} — {variabilidad}",
        descripcion=f"La demanda tiene {variabilidad_desc} (coeficiente de variación {cv:.2f}). {'Predicciones más confiables.' if cv < 0.3 else 'Mayor incertidumbre en la predicción.' if cv > 0.7 else 'Precisión moderada.'}",
        icono="📊",
    ))

    # Factor 4: Volumen histórico
    factores.append(FactorInfluencia(
        nombre="Historial disponible",
        impacto=min(1.0, n / 60),
        valor=f"{n} días de datos",
        descripcion=f"Se usaron {n} días de historial. {'Datos suficientes para proyecciones confiables.' if n >= 30 else 'Historial limitado — se recomienda acumular más datos.'}",
        icono="📁",
    ))

    # Factor 5: Anomalías
    if pct_anomalias > 0.05:
        factores.append(FactorInfluencia(
            nombre="Picos atípicos detectados",
            impacto=-0.3,
            valor=f"{anomalias} días con demanda inusual ({pct_anomalias*100:.0f}%)",
            descripcion=f"Se detectaron {anomalias} días con consumo atípico (>2 desviaciones estándar). Estos eventos afectan la regularidad del patrón.",
            icono="⚠️",
        ))

    # Factor 6: Nivel de stock relativo al mínimo
    margen_stock = stock_actual - stock_minimo
    if stock_actual > 0:
        ratio_stock = margen_stock / max(1, stock_actual)
        factores.append(FactorInfluencia(
            nombre="Margen sobre stock mínimo",
            impacto=ratio_stock,
            valor=f"{margen_stock} u. sobre el mínimo ({stock_minimo} u.)",
            descripcion=f"El stock actual ({stock_actual} u.) {'supera cómodamente' if ratio_stock > 0.5 else 'está cerca de' if ratio_stock > 0 else 'está por debajo de'} el stock mínimo requerido ({stock_minimo} u.).",
            icono="📦",
        ))

    # Ordenar por impacto absoluto
    factores.sort(key=lambda f: abs(f.impacto), reverse=True)

    # ── Patrones detectados ───────────────────────────────────
    patrones: list[PatronDetectado] = []

    if abs(tendencia_global) > 10:
        patrones.append(PatronDetectado(
            tipo="tendencia",
            descripcion=f"Tendencia {'creciente' if tendencia_global > 0 else 'decreciente'} de {abs(tendencia_global):.1f}% en el período analizado",
            magnitud=min(1.0, abs(tendencia_global) / 50),
            icono="📈" if tendencia_global > 0 else "📉",
        ))

    if abs(factor_estacionalidad) > 0.15 and n >= 14:
        patrones.append(PatronDetectado(
            tipo="estacionalidad",
            descripcion=f"Patrón semanal claro — los {dia_pico_nombre} concentran mayor demanda",
            magnitud=min(1.0, abs(factor_estacionalidad)),
            icono="🗓️",
        ))

    if cv < 0.2:
        patrones.append(PatronDetectado(
            tipo="ciclo",
            descripcion="Demanda muy estable — consumo regular y predecible",
            magnitud=0.9,
            icono="✅",
        ))

    if pct_anomalias > 0.1:
        patrones.append(PatronDetectado(
            tipo="anomalia",
            descripcion=f"Presencia de picos esporádicos ({pct_anomalias*100:.0f}% de los días)",
            magnitud=pct_anomalias,
            icono="⚡",
        ))

    if not patrones:
        patrones.append(PatronDetectado(
            tipo="ciclo",
            descripcion="Patrón de demanda sin tendencia ni estacionalidad dominante",
            magnitud=0.3,
            icono="➡️",
        ))

    # ── Razonamiento paso a paso (chain-of-thought) ───────────
    razonamiento = _generar_razonamiento(
        modelo_usado, n, consumo_diario, tendencia_7d, tendencia_30d,
        factor_estacionalidad, dia_pico_nombre, variabilidad, mape,
        consumo_proyectado_total, horizonte_dias, confianza
    )

    # ── Resumen principal ─────────────────────────────────────
    resumen = _generar_resumen(
        consumo_diario, tendencia_7d, dias_hasta_agotamiento,
        reposicion_recomendada, nivel_confianza, modelo_usado
    )

    # ── Recomendación accionable ──────────────────────────────
    recomendacion = _generar_recomendacion(
        dias_hasta_agotamiento, reposicion_recomendada,
        stock_actual, stock_minimo, tendencia_7d, nivel_confianza
    )

    return ExplicacionXAI(
        resumen=resumen,
        confianza=confianza,
        nivel_confianza=nivel_confianza,
        color_confianza=color_confianza,
        factores=factores,
        patrones=patrones,
        razonamiento=razonamiento,
        recomendacion=recomendacion,
        datos_historicos_dias=n,
        consumo_promedio_diario=round(consumo_diario, 2),
        tendencia_7d=round(tendencia_7d, 1),
        tendencia_30d=round(tendencia_30d, 1),
        dia_semana_pico=dia_pico_nombre,
        variabilidad=variabilidad,
    )


def _calcular_confianza(mape: float | None, n_datos: int, cv: float) -> float:
    score = 60.0
    # Más datos = más confianza
    score += min(20, n_datos / 3)
    # Menor MAPE = más confianza
    if mape is not None:
        if mape < 10:   score += 20
        elif mape < 20: score += 12
        elif mape < 35: score += 5
        else:           score -= 10
    # Menor variabilidad = más confianza
    if cv < 0.3:   score += 10
    elif cv < 0.7: score += 3
    else:          score -= 8
    return round(min(98, max(25, score)), 1)


def _generar_resumen(
    consumo_diario: float, tendencia_7d: float, dias_agot: int | None,
    reposicion: int, nivel_confianza: str, modelo: str
) -> str:
    tend_txt = ""
    if tendencia_7d > 10:  tend_txt = " con demanda creciente"
    elif tendencia_7d < -10: tend_txt = " con demanda en descenso"

    if dias_agot is not None and dias_agot < 14:
        urgencia = f"⚠️ Stock crítico: se agotará en {dias_agot} días."
        return f"{urgencia} Consumo promedio de {consumo_diario:.1f} u/día{tend_txt}. Se recomienda reponer {reposicion} unidades. Confianza {nivel_confianza.lower()} ({modelo})."
    elif dias_agot is not None and dias_agot < 30:
        return f"Stock disponible por {dias_agot} días. Consumo de {consumo_diario:.1f} u/día{tend_txt}. Planifica reposición de {reposicion} u. Confianza {nivel_confianza.lower()} ({modelo})."
    else:
        return f"Stock en niveles seguros. Consumo promedio de {consumo_diario:.1f} u/día{tend_txt}. Proyección generada con confianza {nivel_confianza.lower()} usando {modelo}."


def _generar_recomendacion(
    dias_agot: int | None, reposicion: int,
    stock_actual: int, stock_minimo: int,
    tendencia_7d: float, nivel_confianza: str
) -> str:
    if dias_agot is not None and dias_agot <= 7:
        return f"🔴 Acción inmediata: realiza un pedido de al menos {reposicion} unidades hoy. El stock se agotará en {dias_agot} días."
    elif dias_agot is not None and dias_agot <= 14:
        return f"🟠 Acción esta semana: genera una orden de compra por {reposicion} unidades para evitar desabasto en {dias_agot} días."
    elif dias_agot is not None and dias_agot <= 30:
        sufijo = " La demanda creciente puede acelerar el agotamiento." if tendencia_7d > 10 else ""
        return f"🟡 Planifica reposición de {reposicion} unidades en los próximos 2 semanas.{sufijo}"
    elif tendencia_7d > 20:
        return f"📈 La demanda aumentó {tendencia_7d:.0f}% esta semana. Considera incrementar tu pedido habitual para cubrir la tendencia creciente."
    elif stock_actual <= stock_minimo:
        return f"⚠️ Stock por debajo del mínimo requerido ({stock_minimo} u.). Repón {reposicion} unidades a la brevedad."
    else:
        return f"✅ Stock en niveles adecuados. Mantén el ciclo habitual de reposición. Confianza de predicción: {nivel_confianza}."


def _generar_razonamiento(
    modelo: str, n: int, consumo_diario: float, tendencia_7d: float,
    tendencia_30d: float, factor_est: float, dia_pico: str,
    variabilidad: str, mape: float | None, total_proyectado: float,
    horizonte: int, confianza: float
) -> list[str]:
    pasos = []

    pasos.append(
        f"📁 Análisis del historial: Se procesaron {n} días de datos de consumo. "
        f"El consumo promedio diario es de {consumo_diario:.2f} unidades."
    )

    if abs(tendencia_7d) > 5:
        dir_7 = "aumentando" if tendencia_7d > 0 else "disminuyendo"
        pasos.append(
            f"📈 Detección de tendencia: La demanda está {dir_7} a un ritmo de "
            f"{abs(tendencia_7d):.1f}% semanal. "
            f"{'Esto eleva' if tendencia_7d > 0 else 'Esto reduce'} la proyección base."
        )
    else:
        pasos.append(
            f"➡️ Tendencia estable: No se detecta cambio significativo en la demanda reciente "
            f"(variación de {tendencia_7d:+.1f}% en los últimos 7 días)."
        )

    if abs(factor_est) > 0.1 and n >= 14:
        pasos.append(
            f"📅 Patrón semanal: Los {dia_pico} concentran mayor demanda "
            f"({abs(factor_est)*100:.0f}% {'sobre' if factor_est > 0 else 'bajo'} el promedio). "
            f"El modelo incorpora este patrón en las proyecciones día a día."
        )

    pasos.append(
        f"🤖 Selección del modelo: Se utilizó {modelo} para generar la proyección. "
        + (f"Error de ajuste MAPE = {mape:.1f}% ({'excelente' if mape < 15 else 'aceptable' if mape < 30 else 'elevado'})." if mape is not None else "Sin métricas de validación disponibles.")
    )

    pasos.append(
        f"🔮 Proyección resultante: Para los próximos {horizonte} días se espera un consumo "
        f"total de {total_proyectado:.0f} unidades ({total_proyectado/horizonte:.1f} u/día promedio). "
        f"Confianza del modelo: {confianza:.0f}%."
    )

    if variabilidad == "Alta":
        pasos.append(
            "⚡ Nota de incertidumbre: La alta variabilidad histórica amplía el intervalo de confianza. "
            "Los valores reales pueden diferir del pronóstico. Se recomienda mantener un stock de seguridad mayor."
        )

    return pasos
