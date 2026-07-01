# ── InvSystem Pro — Comandos de desarrollo ─────────────────────
.PHONY: up down build logs shell-api shell-db migrate seed test lint

# Levantar todos los servicios
up:
	docker compose up -d --build
	@echo "✅  Sistema levantado"
	@echo "   Frontend  → http://localhost:5173"
	@echo "   API       → http://localhost:8000/docs"
	@echo "   Proxy     → http://localhost:80"

# Detener servicios
down:
	docker compose down

# Ver logs en tiempo real
logs:
	docker compose logs -f

logs-api:
	docker compose logs -f backend

# Reconstruir imágenes
build:
	docker compose build --no-cache

# Shell en el contenedor del backend
shell-api:
	docker compose exec backend bash

# Shell en PostgreSQL
shell-db:
	docker compose exec db psql -U admin -d inventario

# Correr migraciones de Alembic
migrate:
	docker compose exec backend alembic upgrade head

# Seed de datos de prueba
seed:
	docker compose exec db psql -U admin -d inventario -f /docker-entrypoint-initdb.d/init.sql

# Tests del backend
test:
	docker compose exec backend pytest tests/ -v

# Lint Python
lint:
	docker compose exec backend ruff check app/

# Actualizar dependencias
freeze:
	docker compose exec backend pip freeze > backend/requirements.txt

# Estado de los contenedores
status:
	docker compose ps
