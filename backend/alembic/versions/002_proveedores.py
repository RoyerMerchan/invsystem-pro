"""Agregar tabla proveedores y FK en productos

Revision ID: 002_proveedores
Revises: 001_initial
Create Date: 2026-05-05
"""
from alembic import op
import sqlalchemy as sa

revision = '002_proveedores'
down_revision = '001_initial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Tabla proveedores
    op.create_table(
        'proveedores',
        sa.Column('id', sa.Integer, primary_key=True, index=True),
        sa.Column('nombre', sa.String(200), nullable=False),
        sa.Column('contacto', sa.String(100), server_default=''),
        sa.Column('email', sa.String(200), nullable=True),
        sa.Column('telefono', sa.String(30), server_default=''),
        sa.Column('direccion', sa.Text, server_default=''),
        sa.Column('activo', sa.Boolean, server_default='true'),
        sa.Column('creado_en', sa.DateTime, server_default=sa.func.now()),
        sa.Column('actualizado_en', sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index('ix_proveedores_nombre', 'proveedores', ['nombre'])

    # FK en productos → proveedores (nullable, SET NULL al borrar proveedor)
    op.add_column('productos',
        sa.Column('proveedor_id', sa.Integer, nullable=True)
    )
    op.create_foreign_key(
        'fk_productos_proveedor',
        'productos', 'proveedores',
        ['proveedor_id'], ['id'],
        ondelete='SET NULL',
    )
    op.create_index('ix_productos_proveedor_id', 'productos', ['proveedor_id'])


def downgrade() -> None:
    op.drop_index('ix_productos_proveedor_id', 'productos')
    op.drop_constraint('fk_productos_proveedor', 'productos', type_='foreignkey')
    op.drop_column('productos', 'proveedor_id')
    op.drop_index('ix_proveedores_nombre', 'proveedores')
    op.drop_table('proveedores')
