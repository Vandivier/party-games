# Deck Arena — House Rules

[RULES.md](./RULES.md) is authoritative. This file fills the gaps it leaves open
so the game can be played (and implemented) without arguing. Every entry below is
a default choice, not part of the authored rules.

## The card value table

One table drives every number in the game. A card's rank puts it in a tier:

| Rank    | Tier | Weapon damage | Weapon range | Heart heals | Spade shields |
| ------- | ---- | ------------- | ------------ | ----------- | ------------- |
| A–4     | 1    | 1             | 2 cells      | 1           | 1             |
| 5–9     | 2    | 2             | 4 cells      | 2           | 2             |
| 10–K    | 3    | 3             | 6 cells      | 3           | 3             |

Aces are low (value 1). Diamonds are the exception: their energy is set by the
authored rules, not by tier.

## The board

- Coordinates are `x, y` with both in 1–6. `x` runs west to east, `y` runs north
  to south, so `1,1` is the north-west corner and north is `y − 1`.
- The 36 dealt cards lie face down, one per cell. Nobody may look at a card until
  they search it.
- The 16 cards set aside form the **face-down pile**. Every discard, every
  replaced weapon, and everything a knocked-out player was carrying goes into it,
  and it is shuffled whenever cards are added.
- At the end of each round, empty cells are refilled face down from that pile.
  If the pile holds fewer cards than there are empty cells, randomly chosen cells
  get them and the rest stay empty.

## Setup

- Turn order is highest 1d6 first; tied players re-roll among themselves.
- Spawn rolls are taken in turn order. A player who rolls an illegal spawn (a
  cell that is occupied or immediately north/south/east/west of an occupied one)
  re-rolls. If the dice cannot find a legal cell after many tries, pick one at
  random from the legal cells that remain.

## Turns

- The action roll is 1d6: **1–3 gives one action, 4–6 gives two**.
- Action costs: move 1, search 1, activate a club/heart/spade 1, shoot 1,
  reload 1. Discarding, playing a diamond for energy, and ending your turn are
  free, as is the first search of the turn.
- **Move** — one step north, south, east, or west per action, staying on the
  board. You cannot move onto a cell another player occupies. Cards on the floor
  do not block movement.
- **Search** — take the face-down card in your own cell into your hand. It
  requires a card there and room in your hand. The first search each turn is
  free; any further search costs an action.
- A player at the hand limit must discard before picking anything up.

## Shooting

- A shot travels along your row or column only — never diagonally.
- The target must be within the weapon's range in cells, and no other living
  player may stand between you and them: bodies block the line of fire.
- Damage comes off shield first, then health.
- Shooting empties the weapon and turns it face up: from the first shot on,
  everyone knows what you are carrying. Until then the equipped card stays face
  down, though whether it is loaded or sideways is public.

## Knock-outs and winning

- A player at 0 health is out. Their hand and their equipped weapon go into the
  face-down pile and their die leaves the board.
- The last player standing wins. If the last two players are knocked out
  simultaneously, nobody wins.
