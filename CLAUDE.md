# Working in this repo

Party games playable with a standard poker deck and dice, plus a Next.js app for playing them
against a bot or a friend on the same screen.

## Commands

```bash
npm run dev        # dev server on :3000
npm test           # vitest (tests/**/*.test.ts)
npm run typecheck  # tsc --noEmit — run this, the build's checker is not a substitute
npm run build      # production build
```

## Architecture

Three layers, in dependency order. Nothing may point back up the list.

1. **`src/core/`** — table primitives: `cards.ts` (deck, suits, values), `dice.ts`, `rng.ts`
   (seeded `Random`), `game-definition.ts`. No game rules here, no framework imports.
2. **`games/<game>/`** — one self-contained directory per game holding the rules docs and the rules
   code: `engine.ts`, `bot.ts`, `view.ts`, `types.ts`. Pure TypeScript. No React, no `fetch`, no
   `fs`, no randomness beyond the seeded `Random` on the state.
3. **`src/server/` and `src/app/` and `src/components/`** — the session store, the API routes, and
   the UI.

### Engine contract

An engine owns all state and every legality check, and never prompts or renders. Callers drive it:

- `createGame(options)` → state (holds a seeded `Random`, so a seed replays a table exactly)
- `currentActor(state)` → the seat the game is waiting on, or `null` when it is over
- `legalActions(state)` → labelled actions for that seat; `act(state, action)` → `{ok, error}`
- `resolveDefense(state, choice)` answers a `state.pendingAttack`

`act` mutates state in place and returns a result object; it never throws for a rule violation —
an illegal move comes back as `{ok: false, error}` so the UI can show it.

### Server rules

- The session store is the only holder of engine state. Clients receive `view.ts` snapshots, which
  redact other seats' hands down to a count. Never widen a view to include hidden cards.
- Bot seats are resolved inside the store (`runBots`) before a response goes out, so bot reasoning
  never reaches the client.
- Route handlers stay thin: parse (`src/server/validate.ts`), call the store, map `GameError` to a
  status with `errorResponse`. Request bodies are parsed by hand — no schema library.
- Sessions live in memory keyed on `globalThis` so dev hot-reload does not drop live tables. There
  is no database; a restart clears the tables.

## Rules documents

`games/<game>/RULES.md` is the authored rule set and is kept **literal** — it is the spec, not a
summary of the code. Anything the rules leave open (hit points, bonus sizes, deck exhaustion) goes
in `HOUSE_RULES.md` as an explicitly labelled default. If the engine and `RULES.md` disagree, the
engine is wrong. `/hero-war/rules` reads both files off disk, so they cannot drift from the app.

## Conventions

- TypeScript strict, including `noUncheckedIndexedAccess` — index access is `T | undefined`, so
  narrow it rather than reaching for `as`.
- Imports use path aliases: `@/*` → `src/*`, `@games/*` → `games/*`. No `.js` extensions in import
  specifiers; Turbopack resolves the bare path.
- `verbatimModuleSyntax` is on: import types with `import type`.
- Styling is plain CSS in `src/app/globals.css` with semantic class names. No CSS framework.
- Comments explain why, not what, and are rare. Names carry the meaning.

## Testing

`tests/` mirrors the layers: `core`, `hero-war-engine`, `hero-war-bot`, `hero-war-view`,
`hero-war-server`. Engine tests stage a table by overwriting hands with known cards
(`staged([...], [...])`) rather than fishing for a lucky seed. Bot tests play whole games out to a
winner, which is the regression test that matters most: it catches illegal actions, stuck turns,
and non-terminating games in one go. Add tests in the same style for a new game.

## Adding a game

1. `games/<name>/RULES.md` first, verbatim from whoever authored the rules.
2. `HOUSE_RULES.md` for every gap you had to fill.
3. `engine.ts`, `bot.ts`, `view.ts`, `types.ts` against `src/core`.
4. Export a `GameDefinition` from `games/<name>/index.ts`, register it in `src/games/registry.ts`.
5. Store in `src/server/`, routes under `src/app/api/<name>/`, page under `src/app/<name>/`.
6. Tests for engine, bot, view, and store.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
