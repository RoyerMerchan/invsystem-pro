#!/bin/bash
# Ejecutar si el dashboard aparece vacío después de docker compose up
# Uso: bash seed.sh

echo "Cargando datos de ejemplo en la base de datos..."
docker compose exec db psql -U postgres -d inventario -c "
INSERT INTO productos (nombre, categoria, sku, stock_actual, stock_minimo, precio_unitario, costo_unitario, unidad_medida)
VALUES
  ('Laptop HP 15',        'Electrónica',   'LAP-HP15-001', 24,  5, 850.00, 620.00, 'unidad'),
  ('Mouse inalámbrico',   'Electrónica',   'MOU-INL-002',   3, 10,  29.00,  15.00, 'unidad'),
  ('Teclado mecánico',    'Electrónica',   'TEC-MEC-003',  18,  5,  75.00,  42.00, 'unidad'),
  ('Camiseta básica M',   'Ropa',          'CAM-BAS-004',   2, 15,  18.00,   8.00, 'unidad'),
  ('Pantalón cargo',      'Ropa',          'PAN-CAR-005',  40, 10,  45.00,  22.00, 'unidad'),
  ('Aceite de oliva 1L',  'Alimentos',     'ACE-OLI-006',   7, 20,  12.00,   7.00, 'litro'),
  ('Taladro percutor',    'Herramientas',  'TAL-PER-007',  11,  3, 130.00,  80.00, 'unidad'),
  ('Martillo 500g',       'Herramientas',  'MAR-500-008',   0,  5,  22.00,  10.00, 'unidad'),
  ('Monitor 24\"',        'Electrónica',   'MON-24-009',    6,  2, 320.00, 210.00, 'unidad'),
  ('Arroz integral 1kg',  'Alimentos',     'ARR-INT-010',  50, 30,   3.50,   2.00, 'bolsa')
ON CONFLICT (sku) DO NOTHING;
"
echo "Listo. Recarga http://localhost:5173"
