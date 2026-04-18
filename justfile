set shell := ["bash", "-c"]

default:
    @just --list

fmt:
    pnpm exec prettier . --write

fmt-files *files:
    pnpm exec prettier --write {{files}}

fmt-check:
    pnpm exec prettier . --check

lint:
    pnpm -r --if-present run lint

typecheck:
    pnpm -r --if-present run typecheck

check: fmt-check lint typecheck

dev:
    pnpm --filter "@ani-en/web-app" --filter "@ani-en/sync-server" --parallel run dev

build:
    pnpm --filter "@ani-en/web-app" run build

docker-up:
    docker compose -f packages/local-infra/docker-compose.yml up -d

docker-down:
    docker compose -f packages/local-infra/docker-compose.yml down

docker-restart:
    docker compose -f packages/local-infra/docker-compose.yml restart

init-garage:
    packages/local-infra/init-garage.sh
