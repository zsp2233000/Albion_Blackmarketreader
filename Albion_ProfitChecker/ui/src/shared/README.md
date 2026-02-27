# React Core Shared Layer

This folder is the reusable base for the React migration.

## Goals
- One consistent API client for browser requests.
- One auth service and one auth guard behavior.
- One region sync service for localStorage + BroadcastChannel.
- Reusable UI primitives for features.
- Unified asset and icon paths.

## Structure
- `api/` shared network client
- `auth/` auth service + guard
- `region/` region state sync
- `ui/` primitive components
- `assets/` unified path helpers
- `icons/` icon registry + icon component

## Integration (next package)
1. Mount this in the future React app (`src/shared`).
2. Wire `authService` into app bootstrap.
3. Use `AuthGuard` on protected routes.
4. Replace hardcoded paths with `assetUrl()` / `iconUrl()`.

