"""
Tests de autenticación y seguridad.
Cubre: registro, login, JWT, rate limiting, validación de password.
"""
import pytest
from httpx import AsyncClient

from tests.conftest import (
    ADMIN_DATA, USER_DATA,
    registrar_usuario, obtener_token, headers_admin,
)


@pytest.mark.asyncio
class TestRegistro:
    async def test_registro_exitoso(self, client: AsyncClient):
        r = await client.post("/api/v1/auth/registro", json=ADMIN_DATA)
        assert r.status_code == 201
        data = r.json()
        assert data["email"] == ADMIN_DATA["email"]
        assert data["rol"] == "analista"
        assert "hashed_password" not in data

    async def test_registro_email_duplicado(self, client: AsyncClient):
        await registrar_usuario(client, ADMIN_DATA)
        r = await client.post("/api/v1/auth/registro", json=ADMIN_DATA)
        assert r.status_code == 400
        assert "correo" in r.json()["detail"].lower()

    async def test_registro_password_debil(self, client: AsyncClient):
        data = {**ADMIN_DATA, "password": "simple"}
        r = await client.post("/api/v1/auth/registro", json=data)
        assert r.status_code == 422

    async def test_registro_password_sin_mayuscula(self, client: AsyncClient):
        data = {**ADMIN_DATA, "password": "sinmayuscula1!"}
        r = await client.post("/api/v1/auth/registro", json=data)
        assert r.status_code == 422

    async def test_registro_password_sin_especial(self, client: AsyncClient):
        data = {**ADMIN_DATA, "password": "SinEspecial1"}
        r = await client.post("/api/v1/auth/registro", json=data)
        assert r.status_code == 422

    async def test_registro_email_invalido(self, client: AsyncClient):
        data = {**ADMIN_DATA, "email": "no-es-un-email"}
        r = await client.post("/api/v1/auth/registro", json=data)
        assert r.status_code == 422

    async def test_registro_nombre_corto(self, client: AsyncClient):
        data = {**ADMIN_DATA, "nombre": "A"}
        r = await client.post("/api/v1/auth/registro", json=data)
        assert r.status_code == 422


@pytest.mark.asyncio
class TestLogin:
    async def test_login_exitoso(self, client: AsyncClient):
        await registrar_usuario(client, USER_DATA)
        r = await client.post(
            "/api/v1/auth/token",
            data={"username": USER_DATA["email"], "password": USER_DATA["password"]},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert "usuario" in data

    async def test_login_password_incorrecta(self, client: AsyncClient):
        await registrar_usuario(client, USER_DATA)
        r = await client.post(
            "/api/v1/auth/token",
            data={"username": USER_DATA["email"], "password": "WrongPass1!"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert r.status_code == 401

    async def test_login_usuario_inexistente(self, client: AsyncClient):
        r = await client.post(
            "/api/v1/auth/token",
            data={"username": "noexiste@test.com", "password": "AnyPass1!"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert r.status_code == 401

    async def test_me_con_token_valido(self, client: AsyncClient):
        await registrar_usuario(client, USER_DATA)
        token = await obtener_token(client, USER_DATA["email"], USER_DATA["password"])
        r = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert r.json()["email"] == USER_DATA["email"]

    async def test_me_sin_token(self, client: AsyncClient):
        r = await client.get("/api/v1/auth/me")
        assert r.status_code == 401

    async def test_me_token_invalido(self, client: AsyncClient):
        r = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer token.falso.123"})
        assert r.status_code == 401

    async def test_logout(self, client: AsyncClient):
        await registrar_usuario(client, USER_DATA)
        token = await obtener_token(client, USER_DATA["email"], USER_DATA["password"])
        r = await client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
