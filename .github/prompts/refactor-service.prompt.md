---
mode: agent
description: Extract signals from game.ts or creator.ts into a new domain service using the getter delegate pattern
---

# Extract Signals into a Service

You are refactoring the TDODJ codebase. The goal is to extract a group of related signals (and optionally helper methods) from a large component (`game.ts` or `creator.ts`) into a new, focused Angular service.

## What you are extracting

$input

## Step-by-step process

1. **Read context**
   - Read the source component to locate all signals being extracted and any helper methods that *only* depend on those signals.
   - Check `refactor-progress.txt` to understand what's already been done.
   - Check `src/app/interfaces/game/index.ts` if any types need to move.

2. **Create the service** at `src/app/services/<name>.ts`
   - `@Injectable({ providedIn: 'root' })`
   - Declare signals as `readonly` at the top of the class
   - Include only pure helper methods — methods that call `consumePlayerAE`, `startMonsterTurns`, or `saveGameState` are orchestrators and MUST stay in the component
   - Export any local types/interfaces that belong to this domain

3. **Update the component**
   - Add `readonly <name>Service = inject(<ServiceClass>);` (use `inject()`, not constructor)
   - Replace each signal declaration with a getter delegate:
     ```typescript
     get signalName() { return this.<name>Service.signalName; }
     ```
   - Remove any local type/interface definitions that were moved to the service
   - Do NOT change any call sites — getter delegates preserve the same API

4. **Verify**
   - Run `get_errors` on the component, the new service, and all 5 consumers:
     `game.ts`, `creator.ts`, `dungeon-preview-grid.ts`, `dungeon-first-person.ts`, `dashboard.ts`
   - Fix any errors before proceeding

5. **Update `refactor-progress.txt`**
   - Add a `[DONE]` entry with: service file path, signal count, exported types, any notes

## Rules

- `grep_search` on `.ts` files requires `includeIgnoredFiles: true`
- `replace_string_in_file` must include 3–5 lines of surrounding context
- Computed signals that cross service boundaries (e.g. `placeMonsterWeaponChoices`) stay in the component
- `dungons` not `dungeons` — preserve intentional codebase spelling
- Services are `providedIn: 'root'` — never component-scoped unless explicitly needed
