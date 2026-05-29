# UI Structure

## Root
- `src/` React app code
- `public/` static runtime assets (images, JSON, env file)
- `api/` backend/serverless related code

## `src/`
- `main.tsx` app bootstrap
- `App.tsx` route registration
- `pages/` non-tool route pages (`LandingPage`, `LoginPage`, `LegalPage`, `CommunityPage`)
- `features/` tool modules:
  - `dashboard/`
  - `bm-crafter/`
  - `crafting-calculator/`
  - `refining-calculator/`
- `shared/` cross-feature modules:
  - `auth/`, `region/`, `api/`, `assets/`, `ui/`, `icons/`, `seo/`

## Conventions
- Tool routes live in `src/features/<tool-name>`.
- Non-tool routes live in `src/pages`.
- Shared reusable code lives in `src/shared`.
- Feature-specific code stays under `src/features/<feature-name>`.
- Static files are loaded from `/public` via root-relative URLs (`/data/...`, `/picture/...`).
