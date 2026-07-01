"""Tests del módulo de ventas — CRUD, stock, roles"""
import pytest
from httpx import AsyncClient

from tests.conftest import headers_admin, headers_user, ADMIN_DATA


@pytest.mark.asyncio
class TestVentasCRUD:
    async def _crear_producto(self, client, headers):
        r = await client.post("/api/v1/productos/", json={
            "nombre": "Producto Test", "categoria": "Electrónica",
            "sku": "TST-001", "stock_actual": 50, "stock_minimo": 5,
            "precio_unitario": 100.0,
        }, headers=headers)
        assert r.status_code == 201
        return r.json()

    async def test_crear_venta_reduce_stock(self, client: AsyncClient):
        h = await headers_admin(client)
        prod = await self._crear_producto(client, h)
        r = await client.post("/api/v1/ventas/", json={
            "sede": "Sede Test",
            "detalles": [{"producto_id": prod["id"], "cantidad": 3, "precio_unitario": 100.0}],
        }, headers=h)
        assert r.status_code == 201
        data = r.json()
        assert data["total"] == 300.0
        assert len(data["detalles"]) == 1
        # Verificar stock reducido
        r2 = await client.get(f"/api/v1/productos/{prod['id']}", headers=h)
        assert r2.json()["stock_actual"] == 47

    async def test_venta_stock_insuficiente(self, client: AsyncClient):
        h = await headers_admin(client)
        prod = await self._crear_producto(client, h)
        r = await client.post("/api/v1/ventas/", json={
            "sede": "Sede Test",
            "detalles": [{"producto_id": prod["id"], "cantidad": 999, "precio_unitario": 100.0}],
        }, headers=h)
        assert r.status_code == 400
        assert "Stock insuficiente" in r.json()["detail"]

    async def test_listar_ventas(self, client: AsyncClient):
        h = await headers_admin(client)
        prod = await self._crear_producto(client, h)
        await client.post("/api/v1/ventas/", json={
            "sede": "Sede Test", "detalles": [{"producto_id": prod["id"], "cantidad": 2, "precio_unitario": 50.0}],
        }, headers=h)
        r = await client.get("/api/v1/ventas/", headers=h)
        assert r.status_code == 200
        assert len(r.json()) >= 1

    async def test_ventas_sin_token_rechazado(self, client: AsyncClient):
        r = await client.post("/api/v1/ventas/", json={
            "sede": "", "detalles": [{"producto_id": 1, "cantidad": 1, "precio_unitario": 10}],
        })
        assert r.status_code == 401

    async def test_venta_sin_detalles_rechazada(self, client: AsyncClient):
        h = await headers_admin(client)
        r = await client.post("/api/v1/ventas/", json={"sede": "", "detalles": []}, headers=h)
        assert r.status_code == 422

    async def test_venta_producto_inactivo_rechazado(self, client: AsyncClient):
        h = await headers_admin(client)
        prod = await self._crear_producto(client, h)
        # Desactivar producto
        await client.patch(f"/api/v1/productos/{prod['id']}", json={"activo": False}, headers=h)
        r = await client.post("/api/v1/ventas/", json={
            "sede": "", "detalles": [{"producto_id": prod["id"], "cantidad": 1, "precio_unitario": 10}],
        }, headers=h)
        assert r.status_code == 404
