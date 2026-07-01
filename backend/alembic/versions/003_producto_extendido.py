"""Agregar descripcion, stock_maximo, activo a productos

Revision ID: 003_producto_extendido
Revises: 002_proveedores
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa

revision = '003_producto_extendido'
down_revision = '002_proveedores'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('productos', sa.Column('descripcion', sa.Text, server_default=''))
    op.add_column('productos', sa.Column('stock_maximo', sa.Integer, server_default='0'))
    op.add_column('productos', sa.Column('activo', sa.Boolean, server_default='true'))


def downgrade() -> None:
    op.drop_column('productos', 'activo')
    op.drop_column('productos', 'stock_maximo')
    op.drop_column('productos', 'descripcion')
