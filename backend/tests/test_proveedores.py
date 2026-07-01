"""
Tests de proveedores — CRUD con control de roles.
Solo admins pueden crear/editar/desactivar.
Todos los autenticados pueden listar.
"""
import pytest
from httpx import AsyncClient

from tests.conftest import headers_admin, headers_user


PROVEEDOR_VALIDO = {
    "nombre": "Distribuidora Tech S.A.",
    "contacto": "Juan Pérez",
    "email": "juan@disttech.com",
    "telefono": "+52 55 1234 5678",
    "direccion": "Av. Reforma 100, CDMX",
    "activo": True,
}


@pytest.mark.asyncio
class TestProveedoresCRUD:
    async def _crear(self, client, headers, data=None):
        r = await client.post("/api/v1/proveedores/", json=data or PROVEEDOR_VALIDO, headers=headers)
        assert r.status_code == 201
        return r.json()

    async def test_crear_admin_ok(self, client: AsyncClient):
        h = await headers_admin(client)
        r = await client.post("/api/v1/proveedores/", json=PROVEEDOR_VALIDO, headers=h)
        assert r.status_code == 201
        data = r.json()
        assert data["nombre"] == PROVEEDOR_VALIDO["nombre"]
        assert data["activo"] is True
        assert "id" in data

    async def test_crear_usuario_normal_rechazado(self, client: AsyncClient):
        h = await headers_user(client)
        r = await client.post("/api/v1/proveedores/", json=PROVEEDOR_VALIDO, headers=h)
        assert r.status_code == 403

    async def test_listar_usuario_normal_ok(self, client: AsyncClient):
        h_admin = await headers_admin(client)
        await self._crear(client, h_admin)
        h_user = await headers_user(client)
        r = await client.get("/api/v1/proveedores/", headers=h_user)
        assert r.status_code == 200
        assert len(r.json()) >= 1

    async def test_nombre_duplicado_rechazado(self, client: AsyncClient):
        h = await headers_admin(client)
        await self._crear(client, h)
        r = await client.post("/api/v1/proveedores/", json=PROVEEDOR_VALIDO, headers=h)
        assert r.status_code == 400

    async def test_actualizar_proveedor(self, client: AsyncClient):
        h = await headers_admin(client)
        p = await self._crear(client, h)
        r = await client.patch(
            f"/api/v1/proveedores/{p['id']}",
            json={"telefono": "+52 55 9999 0000"},
            headers=h,
        )
        assert r.status_code == 200
        assert r.json()["telefono"] == "+52 55 9999 0000"

    async def test_desactivar_proveedor(self, client: AsyncClient):
        h = await headers_admin(client)
        p = await self._crear(client, h)
        r = await client.delete(f"/api/v1/proveedores/{p['id']}", headers=h)
        assert r.status_code == 204
        # Verificar que sigue existiendo pero inactivo
        r2 = await client.get(f"/api/v1/proveedores/{p['id']}", headers=h)
        assert r2.status_code == 200
        assert r2.json()["activo"] is False

    async def test_filtro_solo_activos(self, client: AsyncClient):
        h = await headers_admin(client)
        p1 = await self._crear(client, h)
        p2 = await self._crear(client, h, {**PROVEEDOR_VALIDO, "nombre": "Otro Proveedor S.A."})
        await client.delete(f"/api/v1/proveedores/{p2['id']}", headers=h)
        r = await client.get("/api/v1/proveedores/?solo_activos=true", headers=h)
        ids = [p["id"] for p in r.json()]
        assert p1["id"] in ids
        assert p2["id"] not in ids

    async def test_proveedor_inexistente(self, client: AsyncClient):
        h = await headers_admin(client)
        r = await client.get("/api/v1/proveedores/9999", headers=h)
        assert r.status_code == 404

    async def test_sin_token_rechazado(self, client: AsyncClient):
        r = await client.get("/api/v1/proveedores/")
        assert r.status_code == 401
