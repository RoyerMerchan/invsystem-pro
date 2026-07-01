"""
Tests del endpoint de alertas.
Cubre: sin stock, stock bajo, estado normal, resumen correcto.
"""
import pytest
from httpx import AsyncClient

from tests.conftest import headers_admin, headers_user


async def _crear_producto(client, headers, **kwargs):
    base = {
        "nombre": "Test", "categoria": "Test", "sku": "TST-001",
        "stock_actual": 10, "stock_minimo": 5,
        "precio_unitario": 10.0, "costo_unitario": 5.0,
    }
    base.update(kwargs)
    r = await client.post("/api/v1/productos/", json=base, headers=headers)
    assert r.status_code == 201
    return r.json()


@pytest.mark.asyncio
class TestAlertas:
    async def test_alertas_requiere_auth(self, client: AsyncClient):
        r = await client.get("/api/v1/alertas/")
        assert r.status_code == 401

    async def test_alertas_vacias(self, client: AsyncClient):
        h = await headers_user(client)
        r = await client.get("/api/v1/alertas/", headers=h)
        assert r.status_code == 200
        data = r.json()
        assert data["resumen"]["total"] == 0
        assert data["sin_stock"] == []
        assert data["stock_bajo"] == []

    async def test_detecta_sin_stock(self, client: AsyncClient):
        h = await headers_admin(client)
        await _crear_producto(client, h, sku="SIN-001", stock_actual=0, stock_minimo=5)
        hu = await headers_user(client)
        r = await client.get("/api/v1/alertas/", headers=hu)
        data = r.json()
        assert data["resumen"]["sin_stock"] == 1
        assert any(p["sku"] == "SIN-001" for p in data["sin_stock"])

    async def test_detecta_stock_bajo(self, client: AsyncClient):
        h = await headers_admin(client)
        await _crear_producto(client, h, sku="BAJO-001", stock_actual=3, stock_minimo=10)
        hu = await headers_user(client)
        r = await client.get("/api/v1/alertas/", headers=hu)
        data = r.json()
        assert data["resumen"]["stock_bajo"] == 1
        assert any(p["sku"] == "BAJO-001" for p in data["stock_bajo"])

    async def test_resumen_correcto(self, client: AsyncClient):
        h = await headers_admin(client)
        await _crear_producto(client, h, sku="NORMAL-001", stock_actual=20, stock_minimo=5)
        await _crear_producto(client, h, sku="BAJO-001",   stock_actual=3,  stock_minimo=10)
        await _crear_producto(client, h, sku="SIN-001",    stock_actual=0,  stock_minimo=5)
        hu = await headers_user(client)
        r = await client.get("/api/v1/alertas/", headers=hu)
        data = r.json()
        assert data["resumen"]["normal"] == 1
        assert data["resumen"]["stock_bajo"] == 1
        assert data["resumen"]["sin_stock"] == 1
        assert data["resumen"]["total"] == 3
