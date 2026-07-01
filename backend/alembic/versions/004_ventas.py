"""Crear tablas ventas y ventas_detalle

Revision ID: 004_ventas
Revises: 003_producto_extendido
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa

revision = '004_ventas'
down_revision = '003_producto_extendido'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'ventas',
        sa.Column('id', sa.Integer, primary_key=True, index=True),
        sa.Column('fecha_venta', sa.DateTime, nullable=False, index=True),
        sa.Column('usuario_id', sa.Integer, sa.ForeignKey('usuarios.id'), nullable=False),
        sa.Column('total', sa.Float, server_default='0.0'),
        sa.Column('sede', sa.String(100), server_default=''),
        sa.Column('creado_en', sa.DateTime, server_default=sa.func.now()),
    )
    op.create_table(
        'ventas_detalle',
        sa.Column('id', sa.Integer, primary_key=True, index=True),
        sa.Column('venta_id', sa.Integer, sa.ForeignKey('ventas.id', ondelete='CASCADE'), nullable=False),
        sa.Column('producto_id', sa.Integer, sa.ForeignKey('productos.id'), nullable=False),
        sa.Column('cantidad', sa.Integer, nullable=False),
        sa.Column('precio_unitario', sa.Float, server_default='0.0'),
        sa.Column('subtotal', sa.Float, server_default='0.0'),
    )
    op.create_index('ix_ventas_detalle_venta', 'ventas_detalle', ['venta_id'])
    op.create_index('ix_ventas_detalle_producto', 'ventas_detalle', ['producto_id'])
    op.create_index('ix_ventas_fecha', 'ventas', ['fecha_venta'])


def downgrade() -> None:
    op.drop_index('ix_ventas_detalle_venta', 'ventas_detalle')
    op.drop_index('ix_ventas_detalle_producto', 'ventas_detalle')
    op.drop_index('ix_ventas_fecha', 'ventas')
    op.drop_table('ventas_detalle')
    op.drop_table('ventas')
