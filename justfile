set shell := ["bash", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command"]

default:
    @just --list

fmt:
    pnpm exec prettier . --write
    cargo fmt --all

fmt-files *files:
    pnpm exec prettier --write {{files}}

fmt-check:
    pnpm exec prettier . --check
    cargo fmt --all --check

lint:
    pnpm -r --if-present run lint
    cargo clippy --workspace --all-targets --all-features -- -D warnings

typecheck:
    pnpm -r --if-present run typecheck
    cargo check --workspace --all-targets --all-features

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
