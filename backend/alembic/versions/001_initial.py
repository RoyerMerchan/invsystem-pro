"""Initial migration — productos y movimientos

Revision ID: 001_initial
Revises:
Create Date: 2025-01-01 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = '001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'productos',
        sa.Column('id', sa.Integer, primary_key=True, index=True),
        sa.Column('nombre', sa.String(200), nullable=False),
        sa.Column('categoria', sa.String(50), nullable=False),
        sa.Column('sku', sa.String(50), unique=True, nullable=False),
        sa.Column('stock_actual', sa.Integer, default=0),
        sa.Column('stock_minimo', sa.Integer, default=0),
        sa.Column('precio_unitario', sa.Float, default=0.0),
        sa.Column('costo_unitario', sa.Float, default=0.0),
        sa.Column('unidad_medida', sa.String(20), default='unidad'),
        sa.Column('creado_en', sa.DateTime, nullable=False),
        sa.Column('actualizado_en', sa.DateTime, nullable=False),
    )
    op.create_table(
        'movimientos',
        sa.Column('id', sa.Integer, primary_key=True, index=True),
        sa.Column('producto_id', sa.Integer, sa.ForeignKey('productos.id'), index=True),
        sa.Column('tipo', sa.String(20), nullable=False),
        sa.Column('cantidad', sa.Integer, nullable=False),
        sa.Column('stock_resultante', sa.Integer, nullable=False),
        sa.Column('motivo', sa.String(200), default=''),
        sa.Column('fecha', sa.DateTime, nullable=False, index=True),
    )


def downgrade() -> None:
    op.drop_table('movimientos')
    op.drop_table('productos')
