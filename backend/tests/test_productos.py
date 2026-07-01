"""
Tests de productos — CRUD completo con control de roles.
Cubre: listar, crear, obtener, actualizar, eliminar.
Verifica que solo admins pueden escribir.
"""
import pytest
from httpx import AsyncClient

from tests.conftest import headers_admin, headers_user


PRODUCTO_VALIDO = {
    "nombre": "Laptop HP 15",
    "categoria": "Electrónica",
    "sku": "LAP-HP15-001",
    "stock_actual": 10,
    "stock_minimo": 3,
    "precio_unitario": 850.0,
    "costo_unitario": 600.0,
    "unidad_medida": "unidad",
}


@pytest.mark.asyncio
class TestProductosAuth:
    async def test_listar_sin_token_rechazado(self, client: AsyncClient):
        r = await client.get("/api/v1/productos/")
        assert r.status_code == 401

    async def test_listar_con_token_ok(self, client: AsyncClient):
        h = await headers_user(client)
        r = await client.get("/api/v1/productos/", headers=h)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    async def test_crear_usuario_normal_rechazado(self, client: AsyncClient):
        h = await headers_user(client)
        r = await client.post("/api/v1/productos/", json=PRODUCTO_VALIDO, headers=h)
        assert r.status_code == 403

    async def test_crear_admin_ok(self, client: AsyncClient):
        h = await headers_admin(client)
        r = await client.post("/api/v1/productos/", json=PRODUCTO_VALIDO, headers=h)
        assert r.status_code == 201
        data = r.json()
        assert data["sku"] == PRODUCTO_VALIDO["sku"]
        assert data["stock_actual"] == PRODUCTO_VALIDO["stock_actual"]

    async def test_eliminar_usuario_normal_rechazado(self, client: AsyncClient):
        h_admin = await headers_admin(client)
        r = await client.post("/api/v1/productos/", json=PRODUCTO_VALIDO, headers=h_admin)
        prod_id = r.json()["id"]

        h_user = await headers_user(client)
        r = await client.delete(f"/api/v1/productos/{prod_id}", headers=h_user)
        assert r.status_code == 403


@pytest.mark.asyncio
class TestProductosCRUD:
    async def _crear(self, client, headers, data=None):
        r = await client.post("/api/v1/productos/", json=data or PRODUCTO_VALIDO, headers=headers)
        assert r.status_code == 201
        return r.json()

    async def test_sku_duplicado(self, client: AsyncClient):
        h = await headers_admin(client)
        await self._crear(client, h)
        r = await client.post("/api/v1/productos/", json=PRODUCTO_VALIDO, headers=h)
        assert r.status_code == 400
        assert "SKU" in r.json()["detail"]

    async def test_obtener_por_id(self, client: AsyncClient):
        h = await headers_admin(client)
        prod = await self._crear(client, h)
        r = await client.get(f"/api/v1/productos/{prod['id']}", headers=h)
        assert r.status_code == 200
        assert r.json()["sku"] == PRODUCTO_VALIDO["sku"]

    async def test_obtener_inexistente(self, client: AsyncClient):
        h = await headers_admin(client)
        r = await client.get("/api/v1/productos/9999", headers=h)
        assert r.status_code == 404

    async def test_actualizar_precio(self, client: AsyncClient):
        h = await headers_admin(client)
        prod = await self._crear(client, h)
        r = await client.patch(
            f"/api/v1/productos/{prod['id']}",
            json={"precio_unitario": 999.0},
            headers=h,
        )
        assert r.status_code == 200
        assert r.json()["precio_unitario"] == 999.0

    async def test_eliminar_producto(self, client: AsyncClient):
        h = await headers_admin(client)
        prod = await self._crear(client, h)
        r = await client.delete(f"/api/v1/productos/{prod['id']}", headers=h)
        assert r.status_code == 204
        r2 = await client.get(f"/api/v1/productos/{prod['id']}", headers=h)
        assert r2.status_code == 200
        assert r2.json()["activo"] == False

    async def test_filtrar_por_categoria(self, client: AsyncClient):
        h = await headers_admin(client)
        await self._crear(client, h)
        otro = {**PRODUCTO_VALIDO, "sku": "ROB-001", "nombre": "Camiseta", "categoria": "Ropa"}
        await self._crear(client, h, otro)
        r = await client.get("/api/v1/productos/?categoria=Ropa", headers=h)
        assert r.status_code == 200
        data = r.json()
        assert all(p["categoria"] == "Ropa" for p in data)

    async def test_stock_negativo_rechazado(self, client: AsyncClient):
        h = await headers_admin(client)
        data = {**PRODUCTO_VALIDO, "stock_actual": -5}
        r = await client.post("/api/v1/productos/", json=data, headers=h)
        assert r.status_code == 422
