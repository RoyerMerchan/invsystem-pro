"""
Módulo de seguridad central — InvSystem Pro
Implementa:
  - Rate limiting por IP (slowapi + Redis)
  - Headers de seguridad HTTP (anti-XSS, anti-clickjacking, CSP)
  - Sanitización de inputs
  - Logging de eventos de seguridad
  - Validación de contraseñas robusta
"""
import logging
import re
import os
from datetime import datetime

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger("security")




# ── Rate Limiter (usa Redis si está disponible) ─────────────────
#REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")


# ── Rate Limiter (memoria local, sin Redis) ──────────────────────
limiter = Limiter(key_func=get_remote_address)
#limiter = Limiter(key_func=get_remote_address, storage_uri=REDIS_URL)


# ── Headers de seguridad ────────────────────────────────────────
SECURITY_HEADERS = {
    # Evita que el navegador adivine el tipo de contenido
    "X-Content-Type-Options": "nosniff",
    # Protege contra clickjacking
    "X-Frame-Options": "DENY",
    # Fuerza HTTPS en producción
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    # Política de referrer
    "Referrer-Policy": "strict-origin-when-cross-origin",
    # Desactiva caché en respuestas de la API
    "Cache-Control": "no-store, no-cache, must-revalidate",
    # Política de permisos del navegador
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    # Content Security Policy
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "connect-src 'self';"
    ),
    # Protección XSS del navegador
    "X-XSS-Protection": "1; mode=block",
}


async def security_headers_middleware(request: Request, call_next):
    """Middleware que inyecta headers de seguridad en todas las respuestas."""
    response = await call_next(request)
    for header, value in SECURITY_HEADERS.items():
        response.headers[header] = value
    return response


# ── Validación de contraseñas ────────────────────────────────────
def validar_password(password: str) -> tuple[bool, str]:
    """
    Valida que la contraseña cumpla requisitos mínimos de seguridad.
    Retorna (es_valida, mensaje_error).
    """
    if len(password) < 8:
        return False, "La contraseña debe tener al menos 8 caracteres"
    if not re.search(r"[A-Z]", password):
        return False, "Debe contener al menos una letra mayúscula"
    if not re.search(r"[a-z]", password):
        return False, "Debe contener al menos una letra minúscula"
    if not re.search(r"\d", password):
        return False, "Debe contener al menos un número"
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>_\-]", password):
        return False, "Debe contener al menos un carácter especial (!@#$%...)"
    return True, ""


# ── Sanitización de inputs ──────────────────────────────────────
def sanitizar_texto(texto: str, max_len: int = 200) -> str:
    """
    Limpia un texto de caracteres peligrosos para prevenir XSS e inyecciones.
    """
    if not texto:
        return ""
    # Eliminar tags HTML
    texto = re.sub(r"<[^>]+>", "", texto)
    # Eliminar scripts
    texto = re.sub(r"(javascript:|data:|vbscript:)", "", texto, flags=re.IGNORECASE)
    # Eliminar caracteres de control
    texto = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", texto)
    # Limitar longitud
    return texto[:max_len].strip()


# ── Logging de seguridad ────────────────────────────────────────
def log_evento_seguridad(
    evento: str,
    ip: str,
    usuario: str = "anónimo",
    detalle: str = "",
):
    """Registra eventos de seguridad importantes."""
    logger.warning(
        f"[SECURITY] {datetime.utcnow().isoformat()} | "
        f"evento={evento} | ip={ip} | usuario={usuario} | {detalle}"
    )


# ── IPs bloqueadas (simple en memoria, usar Redis en producción) ─
_failed_attempts: dict[str, int] = {}
MAX_FAILED = 5


def registrar_intento_fallido(ip: str) -> bool:
    """
    Registra un intento fallido de login.
    Retorna True si la IP debe ser bloqueada (>5 intentos).
    """
    _failed_attempts[ip] = _failed_attempts.get(ip, 0) + 1
    return _failed_attempts[ip] >= MAX_FAILED


def resetear_intentos(ip: str):
    """Limpia el contador al hacer login exitoso."""
    _failed_attempts.pop(ip, None)
