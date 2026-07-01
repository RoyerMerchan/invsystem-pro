"""
Tests de movimientos de inventario.
Cubre: entradas, salidas, ajustes, stock insuficiente, historial.
"""
import pytest
from httpx import AsyncClient

from tests.conftest import headers_admin, headers_user


PRODUCTO_BASE = {
    "nombre": "Mouse Logitech",
    "categoria": "Electrónica",
    "sku": "MOU-LOG-001",
    "stock_actual": 20,
    "stock_minimo": 5,
    "precio_unitario": 35.0,
    "costo_unitario": 18.0,
    "unidad_medida": "unidad",
}


async def _crear_producto(client, headers, producto=None):
    r = await client.post("/api/v1/productos/", json=producto or PRODUCTO_BASE, headers=headers)
    assert r.status_code == 201
    return r.json()["id"]


@pytest.mark.asyncio
class TestMovimientos:
    async def test_entrada_incrementa_stock(self, client: AsyncClient):
        h = await headers_admin(client)
        pid = await _crear_producto(client, h)

        r = await client.post("/api/v1/movimientos/", json={
            "producto_id": pid, "tipo": "entrada", "cantidad": 10, "motivo": "Reposición",
        }, headers=h)
        assert r.status_code == 201
        assert r.json()["stock_resultante"] == 30  # 20 + 10

    async def test_salida_decrementa_stock(self, client: AsyncClient):
        h = await headers_admin(client)
        pid = await _crear_producto(client, h)

        r = await client.post("/api/v1/movimientos/", json={
            "producto_id": pid, "tipo": "salida", "cantidad": 5, "motivo": "Venta",
        }, headers=h)
        assert r.status_code == 201
        assert r.json()["stock_resultante"] == 15  # 20 - 5

    async def test_ajuste_establece_stock(self, client: AsyncClient):
        h = await headers_admin(client)
        pid = await _crear_producto(client, h)

        r = await client.post("/api/v1/movimientos/", json={
            "producto_id": pid, "tipo": "ajuste", "cantidad": 100, "motivo": "Conteo físico",
        }, headers=h)
        assert r.status_code == 201
        assert r.json()["stock_resultante"] == 100

    async def test_salida_stock_insuficiente_rechazada(self, client: AsyncClient):
        h = await headers_admin(client)
        pid = await _crear_producto(client, h)

        r = await client.post("/api/v1/movimientos/", json={
            "producto_id": pid, "tipo": "salida", "cantidad": 999, "motivo": "Error",
        }, headers=h)
        assert r.status_code == 400
        assert "insuficiente" in r.json()["detail"].lower()

    async def test_movimiento_producto_inexistente(self, client: AsyncClient):
        h = await headers_admin(client)
        r = await client.post("/api/v1/movimientos/", json={
            "producto_id": 9999, "tipo": "entrada", "cantidad": 5, "motivo": "",
        }, headers=h)
        assert r.status_code == 404

    async def test_historial_movimientos(self, client: AsyncClient):
        h = await headers_admin(client)
        pid = await _crear_producto(client, h)

        await client.post("/api/v1/movimientos/", json={"producto_id": pid, "tipo": "entrada", "cantidad": 10, "motivo": "A"}, headers=h)
        await client.post("/api/v1/movimientos/", json={"producto_id": pid, "tipo": "salida", "cantidad": 3, "motivo": "B"}, headers=h)

        r = await client.get(f"/api/v1/movimientos/{pid}", headers=h)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 2
        # Debe estar ordenado por fecha descendente
        assert data[0]["tipo"] == "salida"

    async def test_usuario_normal_puede_registrar_movimiento(self, client: AsyncClient):
        """Todos los autenticados pueden registrar movimientos (operarios del almacén)."""
        h_admin = await headers_admin(client)
        pid = await _crear_producto(client, h_admin)

        h_user = await headers_user(client)
        r = await client.post("/api/v1/movimientos/", json={
            "producto_id": pid, "tipo": "entrada", "cantidad": 5, "motivo": "Recepción",
        }, headers=h_user)
        assert r.status_code == 201

    async def test_cantidad_cero_rechazada(self, client: AsyncClient):
        h = await headers_admin(client)
        pid = await _crear_producto(client, h)
        r = await client.post("/api/v1/movimientos/", json={
            "producto_id": pid, "tipo": "entrada", "cantidad": 0, "motivo": "",
        }, headers=h)
        assert r.status_code == 422
