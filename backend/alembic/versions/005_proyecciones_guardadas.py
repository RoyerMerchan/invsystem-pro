"""Crear tabla proyecciones_guardadas

Revision ID: 005_proyecciones_guardadas
Revises: 004_ventas
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa

revision = '005_proyecciones_guardadas'
down_revision = '004_ventas'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'proyecciones_guardadas',
        sa.Column('id', sa.Integer, primary_key=True, index=True),
        sa.Column('producto_id', sa.Integer, sa.ForeignKey('productos.id'), nullable=False, index=True),
        sa.Column('modelo_utilizado', sa.String(50), nullable=False),
        sa.Column('horizonte_dias', sa.Integer, server_default='30'),
        sa.Column('rango_desde', sa.DateTime, nullable=True),
        sa.Column('rango_hasta', sa.DateTime, nullable=True),
        sa.Column('agrupacion', sa.String(20), server_default='diaria'),
        sa.Column('parametros', sa.JSON, server_default='{}'),
        sa.Column('puntos', sa.JSON, server_default='{}'),
        sa.Column('metricas', sa.JSON, server_default='{}'),
        sa.Column('reposicion_recomendada', sa.Integer, server_default='0'),
        sa.Column('dias_agotamiento', sa.Integer, nullable=True),
        sa.Column('created_by_id', sa.Integer, sa.ForeignKey('usuarios.id'), nullable=False),
        sa.Column('creado_en', sa.DateTime, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('proyecciones_guardadas')
