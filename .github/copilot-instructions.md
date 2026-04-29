# DandDanny / TDODJ — GitHub Copilot Instructions

## Project Overview
Full-stack web game — **Tavern of the Order of Dragons & Journey (TDODJ)**.  
Players explore dungeons (combat, traps, inventory), and dungeon creators build and publish content.  
Live at **https://tdodj.com**; API at **https://api.tdodj.com**.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Angular 21, TypeScript, signals, `OnPush`, standalone components |
| Backend | Express 4 on Node.js, TypeScript compiled to `/dist` |
| Database | PostgreSQL via Supabase (session pooler, us-east-2) |
| Infra | EC2 (t3.micro, PM2), S3 + CloudFront, Route 53 |
| CSS | Bootstrap 5.3 + `src/styles.css` |
| Tests | Vitest + jsdom (frontend); no backend tests yet |

---

## Build & Run Commands

```powershell
# Frontend dev server (http://localhost:4200)
npm start              # or: npx ng serve

# Frontend production build
npx ng build --configuration production
# Output: dist/DandDanny/browser/

# Backend dev server (http://localhost:3000)
cd backend; npm run dev      # ts-node-dev with hot reload

# Backend compile
cd backend; npm run build    # tsc → backend/dist/

# Run tests
npm test

# DB migrations
cd backend; npm run migrate  # runs backend/scripts/run-sql-migration.cjs
```

### Deploy
```powershell
# Full frontend deploy (build → S3 → CloudFront invalidation)
.\deploy-frontend.ps1
# Use -SkipBuild or -SkipInvalidation for partial deploys

# Full backend deploy (tsc → SCP to EC2 → PM2 restart)
.\deploy-backend.ps1
# Use -SkipBuild to skip tsc
```

---

## Angular Conventions

### Component structure
- All components are **standalone** (`standalone: true` is implicit in Angular 21)
- Change detection: **`ChangeDetectionStrategy.OnPush`** on all major components
- Use `inject()` for services (not constructor injection), declared `readonly`
- `@ViewChild` / `@HostListener` still used where appropriate

### State management — Signals
- All mutable state lives in `signal<T>()` inside services or components
- Derived state uses `computed()`
- **Getter delegate pattern** in components: expose a service signal via a plain getter with zero call-site changes:
  ```typescript
  get playerHp() { return this.combatService.playerHp; }
  ```
- Services are `providedIn: 'root'` unless scoped to a component tree

### Service extraction pattern (ongoing refactor)
Large components (`game.ts`, `creator.ts`) are being systematically broken up. Each extracted service holds:
- The `signal()` declarations
- Pure helper methods that only read/write those signals
- Orchestrator methods that cross-service boundaries stay in the component

Current services extracted so far:
| Service | Domain |
|---------|--------|
| `dungeon-json.ts` | JSON parse/serialise helpers |
| `dungeon-state.ts` | Dungeon-keyed shared state |
| `game-combat.ts` | Combat signals + `playerDeathCause` |
| `game-inventory.ts` | Inventory signals + helpers |
| `game-movement.ts` | Position, facing, movement preview |
| `game-interaction.ts` | Info panels, NPC dialogs, stash |
| `creator-placement.ts` | 58 placement mode signals |
| `creator-library.ts` | 34 library/catalogue signals |
| `creator-publish.ts` | 9 publish workflow signals |

### Interfaces
Located in `src/app/interfaces/game/` (barrel: `index.ts`).  
All placement interfaces extend `BasePlacement { row, column }`.  
All pending placement interfaces extend `BasePendingPlacement { dungonId, row, column }`.

### Routing & Guards
```
/login, /signup      → logged-in users redirected to /dashboard (logged-in.guard)
/dashboard, /create, /game/:gameId  → requires auth (auth.guard)
/admin               → requires auth + isAdmin() (admin.guard)
/**                  → redirects to '' (wildcard catch-all)
```

---

## Backend Conventions

### 3-layer architecture
```
Request → controllers/ → services/ → repositories/ → PostgreSQL
```
- Controllers: parse req, call service, return res
- Services: business logic, validation
- Repositories: raw SQL via `pg` Pool from `src/db.ts`

### Database
- Table name convention: **singular, no underscores** where possible (e.g., `dungons` not `dungeons` — note the intentional typo, it's the canonical spelling in this codebase)
- Migrations live in `backend/sql/` as numbered SQL files; run via `npm run migrate`
- New columns always added via a migration file, never edited in-place

### Security practices already in place
- Passwords hashed with bcrypt (cost 12)
- Auth endpoints rate-limited (20 req / 15 min per IP) via `express-rate-limit`
- Caddy reverse proxy handles TLS; backend trusts `trust proxy 1`
- Parameterised queries (never string-interpolated SQL)

### Environment variables
- Dev: `backend/.env` — `DATABASE_URL=postgres://...`
- Prod: `backend/.prod.env` — uploaded to EC2 as `.env` by deploy script
- **Never commit `.env` or `.prod.env`**

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `src/app/app.routes.ts` | All client routes + guards |
| `src/app/api-config.ts` | `API_BASE_URL` constant |
| `src/app/components/game/game.ts` | Main game orchestrator (~8000 lines) |
| `src/app/components/creator/creator.ts` | Dungeon editor (~6000 lines) |
| `src/app/interfaces/game/index.ts` | Barrel for all game interfaces |
| `backend/src/index.ts` | Express entry + all route definitions |
| `backend/src/db.ts` | PostgreSQL pool |
| `refactor-progress.txt` | Running log of the active refactor |

---

## Common Pitfalls

- **`dungons`** (not `dungeons`) — intentional throughout codebase and DB schema
- `grep_search` on `.ts` files **requires `includeIgnoredFiles: true`** or results will be empty
- Backend `npm run dev` uses `ts-node-dev`; `npm start` requires a prior `npm run build`
- `ng serve` must run from the **workspace root** (`c:\...\DandDanny`), not from `/backend`
- `replace_string_in_file`: always include 3–5 lines of surrounding context — the large component files have many similar blocks
- After any interface change, run `get_errors` on all 5 current consumers: `game.ts`, `creator.ts`, `dungeon-preview-grid.ts`, `dungeon-first-person.ts`, `dashboard.ts`
- Computed signals that cross service boundaries (`placeMonsterWeaponChoices`, `placeMonsterSelectedInfo`) stay in the component — do not move them to a service
