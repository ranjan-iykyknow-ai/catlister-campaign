.PHONY: candidate-package check db-reset dev setup test

setup:
	cd backend && uv sync
	npm --prefix frontend ci

dev:
	node scripts/dev.mjs

db-reset:
	cd backend && uv run python -m app.db --reset

test:
	cd backend && uv run pytest
	npm --prefix frontend test

check:
	cd backend && uv run ruff check .
	cd backend && uv run pytest
	npm --prefix frontend run check-types
	npm --prefix frontend test
	npm --prefix frontend run build

candidate-package:
	node scripts/package-candidate.mjs
