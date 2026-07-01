-- InvSystem Pro — Inicialización de base de datos
-- Crea las tablas y carga datos de ejemplo

-- ── Usuarios ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
    id               SERIAL PRIMARY KEY,
    nombre           VARCHAR(100) NOT NULL,
    email            VARCHAR(200) UNIQUE NOT NULL,
    hashed_password  VARCHAR(200) NOT NULL,
    rol              VARCHAR(20) DEFAULT 'usuario',
    activo           BOOLEAN DEFAULT TRUE,
    creado_en        TIMESTAMP DEFAULT NOW()
);

-- ── Productos ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS productos (
    id               SERIAL PRIMARY KEY,
    nombre           VARCHAR(200) NOT NULL,
    descripcion      TEXT DEFAULT '',
    categoria        VARCHAR(50) NOT NULL,
    sku              VARCHAR(50) UNIQUE NOT NULL,
    stock_actual     INTEGER DEFAULT 0,
    stock_minimo     INTEGER DEFAULT 0,
    stock_maximo     INTEGER DEFAULT 0,
    precio_unitario  FLOAT DEFAULT 0.0,
    costo_unitario   FLOAT DEFAULT 0.0,
    unidad_medida    VARCHAR(20) DEFAULT 'unidad',
    activo           BOOLEAN DEFAULT TRUE,
    creado_en        TIMESTAMP DEFAULT NOW(),
    actualizado_en   TIMESTAMP DEFAULT NOW()
);

-- ── Movimientos ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS movimientos (
    id               SERIAL PRIMARY KEY,
    producto_id      INTEGER REFERENCES productos(id) ON DELETE CASCADE,
    tipo             VARCHAR(20) NOT NULL,
    cantidad         INTEGER NOT NULL,
    stock_resultante INTEGER NOT NULL,
    motivo           VARCHAR(200) DEFAULT '',
    fecha            TIMESTAMP DEFAULT NOW()
);

-- ── Índices ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_movimientos_producto ON movimientos(producto_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_fecha    ON movimientos(fecha);
CREATE INDEX IF NOT EXISTS idx_usuarios_email       ON usuarios(email);

-- ── Datos de ejemplo ─────────────────────────────────────────────
INSERT INTO productos (nombre, descripcion, categoria, sku, stock_actual, stock_minimo, stock_maximo, precio_unitario, costo_unitario, unidad_medida, activo)
VALUES
  ('Laptop HP 15',        'Laptop HP Pavilion 15.6" 8GB RAM 256GB SSD',          'Electrónica',   'LAP-HP15-001', 24,   5, 50,  850.00, 620.00, 'unidad', true),
  ('Mouse inalámbrico',   'Mouse óptico inalámbrico 2.4GHz',                    'Electrónica',   'MOU-INL-002',   3,  10, 30,  29.00,  15.00, 'unidad', true),
  ('Teclado mecánico',    'Teclado mecánico RGB switches Cherry MX',            'Electrónica',   'TEC-MEC-003',  18,   5, 25,  75.00,  42.00, 'unidad', true),
  ('Camiseta básica M',   'Camiseta de algodón manga corta talle M',            'Ropa',          'CAM-BAS-004',   2,  15, 40,  18.00,   8.00, 'unidad', true),
  ('Pantalón cargo',      'Pantalón cargo multibolsillos tela resistente',      'Ropa',          'PAN-CAR-005',  40,  10, 30,  45.00,  22.00, 'unidad', true),
  ('Aceite de oliva 1L',  'Aceite de oliva extra virgen 1 litro',               'Alimentos',     'ACE-OLI-006',   7,  20, 50,  12.00,   7.00, 'litro',  true),
  ('Taladro percutor',    'Taladro percutor inalámbrico 18V 2 baterías',        'Herramientas',  'TAL-PER-007',  11,   3, 20, 130.00,  80.00, 'unidad', true),
  ('Martillo 500g',       'Martillo de acero forjado mango ergonómico 500g',    'Herramientas',  'MAR-500-008',   0,   5, 15,  22.00,  10.00, 'unidad', true),
  ('Monitor 24"',         'Monitor LED 24" Full HD 75Hz HDMI+VGA',              'Electrónica',   'MON-24-009',    6,   2, 15, 320.00, 210.00, 'unidad', true),
  ('Arroz integral 1kg',  'Arroz integral bolsa 1kg grano largo',               'Alimentos',     'ARR-INT-010',  50,  30, 40,   3.50,   2.00, 'bolsa',  true)
ON CONFLICT (sku) DO NOTHING;
-- ── Proveedores ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proveedores (
    id               SERIAL PRIMARY KEY,
    nombre           VARCHAR(200) NOT NULL,
    contacto         VARCHAR(100) DEFAULT '',
    email            VARCHAR(200),
    telefono         VARCHAR(30) DEFAULT '',
    direccion        TEXT DEFAULT '',
    activo           BOOLEAN DEFAULT TRUE,
    creado_en        TIMESTAMP DEFAULT NOW(),
    actualizado_en   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proveedores_nombre ON proveedores(nombre);

-- FK en productos
ALTER TABLE productos ADD COLUMN IF NOT EXISTS proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_productos_proveedor ON productos(proveedor_id);

-- ── Datos de ejemplo: Proveedores ────────────────────────────────
INSERT INTO proveedores (nombre, contacto, email, telefono, direccion, activo)
VALUES
  ('Distribuidora Tech S.A.', 'Carlos Mendoza',  'cmendoza@disttech.com',  '+52 55 1234 5678', 'Av. Tecnológico 100, CDMX',      true),
  ('Textiles del Norte',      'María González',  'mgonzalez@texnorte.mx',  '+52 81 9876 5432', 'Blvd. Díaz Ordaz 500, Monterrey', true),
  ('Alimentos Frescos S.C.',  'Roberto Álvarez', 'ralvarez@alfrescos.com',  '+52 33 4567 8901', 'Mercado de Abastos, Guadalajara', true),
  ('Ferretools Import',       'Ana Ríos',        'arios@ferretools.com.mx', '+52 55 2345 6789', 'Eje Central 250, CDMX',          true)
ON CONFLICT DO NOTHING;
