"""
Configuración de fixtures compartidas para todos los tests.
Usa SQLite en memoria para no requerir PostgreSQL corriendo.
"""
from datetime import datetime
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.core.database import Base, get_db
from app.main import app


# ── Base de datos en memoria para tests ─────────────────────────
import os
_TEST_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "test_inventario.db")
TEST_DATABASE_URL = f"sqlite+aiosqlite:///{_TEST_DB_PATH}"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False)


async def override_get_db():
    async with TestSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    """Crea todas las tablas antes de cada test y las destruye al final."""
    # Usar TestSessionLocal para compartir la misma conexión que los helpers
    conn = await test_engine.connect()
    await conn.run_sync(Base.metadata.create_all)
    await conn.close()
    app.dependency_overrides[get_db] = override_get_db
    # Desactivar rate limiting en tests
    from app.core.security import limiter
    limiter._limiter.storage.reset()
    yield
    conn = await test_engine.connect()
    await conn.run_sync(Base.metadata.drop_all)
    await conn.close()
    app.dependency_overrides.clear()
    limiter._limiter.storage.reset()


@pytest_asyncio.fixture
async def client():
    """Cliente HTTP async para llamar a la API en tests."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac


# ── Helpers para tests de auth ───────────────────────────────────
ADMIN_DATA = {
    "nombre": "Admin Test",
    "email": "admin@test.com",
    "password": "AdminPass1!",
}

USER_DATA = {
    "nombre": "Usuario Test",
    "email": "user@test.com",
    "password": "UserPass1!",
}


async def registrar_usuario(client: AsyncClient, data: dict) -> dict:
    r = await client.post("/api/v1/auth/registro", json=data)
    assert r.status_code == 201, r.text
    return r.json()


async def obtener_token(client: AsyncClient, email: str, password: str) -> str:
    r = await client.post(
        "/api/v1/auth/token",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


async def headers_admin(client: AsyncClient) -> dict:
    """Registra y autentica un admin, devuelve headers con token."""
    await registrar_usuario(client, ADMIN_DATA)
    # Promover a admin usando override_get_db (sesión compartida)
    async for session in override_get_db():
        from sqlalchemy import select
        from app.models.models import Usuario
        result = await session.execute(select(Usuario).where(Usuario.email == ADMIN_DATA["email"]))
        u = result.scalar_one()
        u.rol = "administrador"
        await session.commit()
        break
    token = await obtener_token(client, ADMIN_DATA["email"], ADMIN_DATA["password"])
    return {"Authorization": f"Bearer {token}"}


async def headers_user(client: AsyncClient) -> dict:
    """Registra y autentica un usuario normal, devuelve headers con token."""
    await registrar_usuario(client, USER_DATA)
    token = await obtener_token(client, USER_DATA["email"], USER_DATA["password"])
    return {"Authorization": f"Bearer {token}"}
