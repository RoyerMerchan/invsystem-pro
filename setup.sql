-- ================================================================
-- InvSystem Pro — Setup completo de base de datos
-- ================================================================
-- USO: psql -U postgres -f setup.sql
--       (ejecutar como superusuario PostgreSQL)
-- ================================================================

-- ── 1. Crear base de datos ─────────────────────────────────────
-- Si ya existe, salta este paso y usa \c inventario manualmente

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'inventario') THEN
    PERFORM dblink_exec('dbname=postgres', 'CREATE DATABASE inventario');
  END IF;
END
$$;

\c inventario;

-- ── 2. Extensiones ─────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================================
-- 3. TABLAS (ordenadas por dependencias de FK)
-- ================================================================

BEGIN;

-- ── 3a. Usuarios ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS usuarios (
    id               SERIAL PRIMARY KEY,
    nombre           VARCHAR(100) NOT NULL,
    email            VARCHAR(200) UNIQUE NOT NULL,
    hashed_password  VARCHAR(200) NOT NULL,
    rol              VARCHAR(20) NOT NULL DEFAULT 'analista',
    activo           BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── 3b. Proveedores ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS proveedores (
    id               SERIAL PRIMARY KEY,
    nombre           VARCHAR(200) NOT NULL,
    contacto         VARCHAR(100) NOT NULL DEFAULT '',
    email            VARCHAR(200),
    telefono         VARCHAR(30) NOT NULL DEFAULT '',
    direccion        TEXT NOT NULL DEFAULT '',
    activo           BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en        TIMESTAMP NOT NULL DEFAULT NOW(),
    actualizado_en   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── 3c. Productos ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS productos (
    id               SERIAL PRIMARY KEY,
    nombre           VARCHAR(200) NOT NULL,
    descripcion      TEXT NOT NULL DEFAULT '',
    categoria        VARCHAR(50) NOT NULL,
    sku              VARCHAR(50) UNIQUE NOT NULL,
    stock_actual     INTEGER NOT NULL DEFAULT 0,
    stock_minimo     INTEGER NOT NULL DEFAULT 0,
    stock_maximo     INTEGER NOT NULL DEFAULT 0,
    precio_unitario  DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    costo_unitario   DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    unidad_medida    VARCHAR(20) NOT NULL DEFAULT 'unidad',
    activo           BOOLEAN NOT NULL DEFAULT TRUE,
    proveedor_id     INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
    creado_en        TIMESTAMP NOT NULL DEFAULT NOW(),
    actualizado_en   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── 3d. Movimientos ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS movimientos (
    id               SERIAL PRIMARY KEY,
    producto_id      INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    tipo             VARCHAR(20) NOT NULL,
    cantidad         INTEGER NOT NULL,
    stock_resultante INTEGER NOT NULL,
    motivo           VARCHAR(200) NOT NULL DEFAULT '',
    fecha            TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── 3e. Ventas ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ventas (
    id               SERIAL PRIMARY KEY,
    fecha_venta      TIMESTAMP NOT NULL DEFAULT NOW(),
    usuario_id       INTEGER NOT NULL REFERENCES usuarios(id),
    total            DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    sede             VARCHAR(100) NOT NULL DEFAULT '',
    creado_en        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── 3f. Detalle de Ventas ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS ventas_detalle (
    id               SERIAL PRIMARY KEY,
    venta_id         INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    producto_id      INTEGER NOT NULL REFERENCES productos(id),
    cantidad         INTEGER NOT NULL,
    precio_unitario  DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    subtotal         DOUBLE PRECISION NOT NULL DEFAULT 0.0
);

-- ── 3g. Proyecciones Guardadas ──────────────────────────────────

CREATE TABLE IF NOT EXISTS proyecciones_guardadas (
    id                    SERIAL PRIMARY KEY,
    producto_id           INTEGER NOT NULL REFERENCES productos(id),
    modelo_utilizado      VARCHAR(50) NOT NULL,
    horizonte_dias        INTEGER NOT NULL DEFAULT 30,
    rango_desde           TIMESTAMP,
    rango_hasta           TIMESTAMP,
    agrupacion            VARCHAR(20) NOT NULL DEFAULT 'diaria',
    parametros            JSONB NOT NULL DEFAULT '{}',
    puntos                JSONB NOT NULL DEFAULT '{}',
    metricas              JSONB NOT NULL DEFAULT '{}',
    reposicion_recomendada INTEGER NOT NULL DEFAULT 0,
    dias_agotamiento      INTEGER,
    created_by_id         INTEGER NOT NULL REFERENCES usuarios(id),
    creado_en             TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ================================================================
-- 4. ÍNDICES
-- ================================================================

CREATE INDEX IF NOT EXISTS idx_movimientos_producto ON movimientos(producto_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_fecha    ON movimientos(fecha);

CREATE INDEX IF NOT EXISTS idx_ventas_fecha         ON ventas(fecha_venta);
CREATE INDEX IF NOT EXISTS idx_ventas_usuario       ON ventas(usuario_id);

CREATE INDEX IF NOT EXISTS idx_ventas_detalle_venta    ON ventas_detalle(venta_id);
CREATE INDEX IF NOT EXISTS idx_ventas_detalle_producto ON ventas_detalle(producto_id);

CREATE INDEX IF NOT EXISTS idx_proyecciones_producto ON proyecciones_guardadas(producto_id);
CREATE INDEX IF NOT EXISTS idx_proyecciones_creador  ON proyecciones_guardadas(created_by_id);

CREATE INDEX IF NOT EXISTS idx_usuarios_email        ON usuarios(email);

CREATE INDEX IF NOT EXISTS idx_proveedores_nombre    ON proveedores(nombre);

CREATE INDEX IF NOT EXISTS idx_productos_sku         ON productos(sku);
CREATE INDEX IF NOT EXISTS idx_productos_categoria   ON productos(categoria);
CREATE INDEX IF NOT EXISTS idx_productos_proveedor   ON productos(proveedor_id);

-- ================================================================
-- 5. DATOS DE EJEMPLO
-- ================================================================

-- ── Proveedores ─────────────────────────────────────────────────

INSERT INTO proveedores (nombre, contacto, email, telefono, direccion)
VALUES
  ('Distribuidora Tech S.A.', 'Carlos Mendoza',  'cmendoza@disttech.com',  '+52 55 1234 5678', 'Av. Tecnologico 100, CDMX'),
  ('Textiles del Norte',      'Maria Gonzalez',  'mgonzalez@texnorte.mx',  '+52 81 9876 5432', 'Blvd. Diaz Ordaz 500, Monterrey'),
  ('Alimentos Frescos S.C.',  'Roberto Alvarez', 'ralvarez@alfrescos.com', '+52 33 4567 8901', 'Mercado de Abastos, Guadalajara'),
  ('Ferretools Import',       'Ana Rios',        'arios@ferretools.com.mx','+52 55 2345 6789', 'Eje Central 250, CDMX')
ON CONFLICT DO NOTHING;

-- ── Productos ───────────────────────────────────────────────────

INSERT INTO productos (nombre, descripcion, categoria, sku, stock_actual, stock_minimo, stock_maximo, precio_unitario, costo_unitario, unidad_medida)
VALUES
  ('Laptop HP 15',       'Laptop HP Pavilion 15.6" 8GB RAM 256GB SSD',          'Electronica',  'LAP-HP15-001', 24,  5, 50,  850.00, 620.00, 'unidad'),
  ('Mouse inalambrico',  'Mouse optico inalambrico 2.4GHz',                    'Electronica',  'MOU-INL-002',   3, 10, 30,   29.00,  15.00, 'unidad'),
  ('Teclado mecanico',   'Teclado mecanico RGB switches Cherry MX',            'Electronica',  'TEC-MEC-003',  18,  5, 25,   75.00,  42.00, 'unidad'),
  ('Camiseta basica M',  'Camiseta de algodon manga corta talle M',            'Ropa',         'CAM-BAS-004',   2, 15, 40,   18.00,   8.00, 'unidad'),
  ('Pantalon cargo',     'Pantalon cargo multibolsillos tela resistente',      'Ropa',         'PAN-CAR-005',  40, 10, 30,   45.00,  22.00, 'unidad'),
  ('Aceite de oliva 1L', 'Aceite de oliva extra virgen 1 litro',               'Alimentos',    'ACE-OLI-006',   7, 20, 50,   12.00,   7.00, 'litro'),
  ('Taladro percutor',   'Taladro percutor inalambrico 18V 2 baterias',        'Herramientas', 'TAL-PER-007',  11,  3, 20,  130.00,  80.00, 'unidad'),
  ('Martillo 500g',      'Martillo de acero forjado mango ergonomico 500g',    'Herramientas', 'MAR-500-008',   0,  5, 15,   22.00,  10.00, 'unidad'),
  ('Monitor 24"',        'Monitor LED 24" Full HD 75Hz HDMI+VGA',              'Electronica',  'MON-24-009',    6,  2, 15,  320.00, 210.00, 'unidad'),
  ('Arroz integral 1kg', 'Arroz integral bolsa 1kg grano largo',               'Alimentos',    'ARR-INT-010',  50, 30, 40,    3.50,   2.00, 'bolsa')
ON CONFLICT (sku) DO NOTHING;

COMMIT;

-- ================================================================
-- VERIFICACION
-- ================================================================

SELECT 'Tablas creadas:' AS info;
SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name;

SELECT 'Seed data:' AS info;
SELECT CONCAT('  Productos: ', COUNT(*)) FROM productos
UNION ALL
SELECT CONCAT('  Proveedores: ', COUNT(*)) FROM proveedores;
