DOCKER_CONTAINER ?= catlister-campaign-demo
DOCKER_IMAGE ?= catlister-campaign-demo
DOCKER_PORT ?= 8080
DOCKER_VOLUME ?= catlister-campaign-data

.PHONY: candidate-package check db-reset dev docker-build docker-down docker-logs docker-run docker-up setup test

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

docker-build:
	docker build --tag $(DOCKER_IMAGE) .

docker-run: docker-build
	docker run --rm --name $(DOCKER_CONTAINER) --env-file .env \
		--env DATABASE_PATH=/data/app.db --publish $(DOCKER_PORT):8000 \
		--volume $(DOCKER_VOLUME):/data $(DOCKER_IMAGE)

docker-up: docker-build
	docker run --detach --name $(DOCKER_CONTAINER) --env-file .env \
		--env DATABASE_PATH=/data/app.db --publish $(DOCKER_PORT):8000 \
		--volume $(DOCKER_VOLUME):/data $(DOCKER_IMAGE)

docker-logs:
	docker logs --follow $(DOCKER_CONTAINER)

docker-down:
	docker rm --force $(DOCKER_CONTAINER)

candidate-package:
	node scripts/package-candidate.mjs
