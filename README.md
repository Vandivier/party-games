# party-games

Games to play IRL with few and common to no props needed — imagination, dice, poker cards, pen,
paper — plus a web app that lets you play them here, against a bot or a friend sharing the screen.

**Playable now:** [Hero War](games/hero_war/RULES.md) — War with a hero on the field. Face cards
fight, clubs are equipment, hearts nullify, diamonds burst, spades sabotage.

**Planned:** [Magic Hero War](games/magic_hero_war/CONCEPT.md) — Hero War gone wide: spells, a
party of heroes, three or more players, and a deck map catalogue that turns ordinary poker cards
into distinct, power-balanced decks. Concept only, nothing implemented.

## Quickstart

```bash
npm install
npm run dev      # http://localhost:3000
```

Other scripts:

```bash
npm test         # vitest
npm run typecheck
npm run build && npm start
```

## Stack

Next.js (App Router) + React 19 + TypeScript, no runtime dependencies beyond those. Game rules live
in plain TypeScript modules with no framework imports, so they are testable on their own and could
be lifted into any other client.

## Layout

```
games/<game>/          one directory per game: rules + engine + bot + view
  RULES.md               the authored rules — authoritative, kept literal
  HOUSE_RULES.md         defaults that settle what the rules leave open
  engine.ts              state machine: createGame / legalActions / act / resolveDefense
  bot.ts                 the computer opponent
  view.ts                per-seat, redacted, serializable snapshot
  types.ts               state and action types
src/core/              shared table primitives: deck, dice, seeded RNG
src/games/registry.ts  the game catalog the lobby renders
src/server/            authoritative session store, request parsing, HTTP helpers
src/app/               routes: lobby, /hero-war, /hero-war/rules, /dice, /api/*
src/components/        React UI
tests/                 vitest suites for core, engine, bot, view, and server
```

## How a game plays out

The server holds the only copy of engine state. A client posts an action for its seat, the server
validates it, plays out any bot seats that follow, and returns a view built for that seat alone —
opponents' hands come back as a count, never as cards. Bot decisions never touch the client, so
there is nothing to peek at in the network tab.

Hot-seat play works by switching seats on the same table: end your turn, hand over the device, and
the next player takes their seat from the panel below the board.

## Rules as the source of truth

Every game's `RULES.md` is the authored rule set and is kept verbatim; where it is silent, the
matching `HOUSE_RULES.md` records the default the engine implements. The app reads both files
straight off disk at `/hero-war/rules`, so the page can never drift from the repo.

## Adding a game

1. Create `games/<name>/` with `RULES.md`, and `HOUSE_RULES.md` if the rules leave anything open.
2. Write `engine.ts` against `src/core` — pure TypeScript, no React and no I/O.
3. Export a `GameDefinition` from `games/<name>/index.ts` and add it to `src/games/registry.ts`.
4. Add a route under `src/app/<name>/`, a store in `src/server/`, and tests in `tests/`.

See [CLAUDE.md](CLAUDE.md) for the conventions in more detail.
