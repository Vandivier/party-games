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

- A player at 0 health is out. Their die leaves the board.
- Whoever landed the killing blow takes the dead player's hand into their own,
  then must discard down to three cards before doing anything else. Anything the
  dead player had in play — their equipped weapon, their face-up aces — goes into
  the face-down pile instead.
- The last player standing wins. If the last two players are knocked out
  simultaneously, nobody wins.

## Special abilities

Special abilities are an option chosen at game start. This app turns them **on by
default**; switch them off for the plain game. Everything in this section applies
only when they are on — including the ace rules, which ride along with them.

### The club snipers

- The jack's shot wipes both overshield and armor, then deals its 1d6 straight to
  health. It reaches as far as the board allows in one direction and hits the
  first player in that line.
- The queen's shot hits the first two players in one direction. Each of them
  either loses all protection (if they had any) or dies outright (if they had
  none). A target with an overshield loses the overshield and the armor both.
- The king's scatter is a range-1 attack: the cell one step away in the chosen
  direction, plus the two cells flanking it. Each occupant takes 6, absorbed by
  protection as normal. The two directions must be different.
- Ability shots cost one action and empty the weapon like any other shot.

### Regen and revive

- "Fully heal" means back to 6. The queen's overheal ceiling of 12 applies to her
  regen ticks only, and a hero above 6 cannot be topped up by an ordinary heart.
- A regen ticks at the start of each of your own turns. Playing a second regen
  replaces the first.
- Auto-revive fires by itself the moment a lethal hit lands — there is no reason
  to decline it. It restores 6 health and leaves protection at zero.

### Overshields

- Overshield and armor are tracked separately. Damage hits the overshield first,
  and whatever the overshield cannot absorb is lost rather than carried on.
- Playing an overshield when you already have one keeps the better of the two.

### The diamond reactions

- Super mobility may be played out of turn. Bots resolve a whole turn inside one
  request, so in practice the window to interrupt them is between turns rather
  than mid-action.
- Teleport moves you to any unoccupied cell.
- Blitzkrieg's free reloads last until the end of the turn it was played on.

### Aces

- An ace goes face up the moment it reaches your hand — searched, picked up at
  spawn, or looted from a kill — and you immediately draw a replacement from the
  pile. This is wider than "when you search" in the authored rules, but it keeps
  the ace-hoarding win reachable and stops a forced discard from eating an ace.
- Playing a face-up ace for its face value costs whatever that suit normally costs
  (a diamond is still free) and discards the ace, giving up its place in the set.
- Collecting all four face-up aces wins the game immediately.
