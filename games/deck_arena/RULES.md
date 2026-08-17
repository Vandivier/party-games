# Deck Arena

**Props:** one standard poker deck, one d6 per player for health, and a second d6
or token per player for shield.

A turn-based poker deck arena battle game for 2–8 players, inspired by arena
battle games like Fortnite.

> The name is a working title — rename it freely.

## Rules (as authored)

### Setup

- Shuffle an ordinary poker deck, then deal a map face down.
- Every map is a 6x6 square.
- Players cannot see the 16 unused cards. Place them aside face down.
- Players now roll 1d6 for turn order.
- Then each player rolls 2d6 for a random spawn location in the map. The rolls
  become x,y coordinates in that order.
- A player must re-roll for position if they would land on an occupied spawn
  point or immediately north/south/east/west of one.
- Players are represented by 1d6 dice at their physical location on the board.
  All players start with the 6 facing up, indicating current health.
- Each player picks up the card at their spawn location and adds it to their
  hand, leaving their map cell empty.

### The map

- Empty map cells replenish randomly from the face-down discard pile every round
  at the end of the round.

### Turns

- Each turn, a player rolls 1d6 for action. They will be able to take 1 or 2
  actions.
- A player can also search one location for free each turn.
- Actions include: move, search, or activate card.
- Players can be holding three cards at most in the hand.
- A player can discard a card at any time.

### Clubs are weapons

- Activating a club from the hand equips it and discards your current equipment,
  shuffling it into the face-down deck.
- An equipped weapon is played in front of the player and off the board.
- An equipped weapon is initially played face-down.
- Equipped weapons begin with full ammo.
- Activating an equipped weapon with ammo triggers a shoot action, potentially
  damaging another player.
- Shoot depletes ammo and the card is turned sideways to signify it is out of
  ammo.
- Activating a depleted weapon triggers reload, enabling it to be shot again.
- When a player ends their turn, their weapon is automatically reloaded for free.

### The other suits

- Hearts heal hp, to a maximum of 6.
- Spades add shield, to a maximum of 6.
- Diamonds grant bonus energy. Discarding a diamond grants one additional action
  if the value is ace (one) to six, or two additional actions if the value is
  seven or higher.
- Whenever players play a diamond card, it does not cost anything. If a player
  "plays" a 2 of diamonds, they do not "spend one action point to gain one action
  point." They "spend nothing to gain one action point." This is true for any
  diamond card, not just face cards and not just in special ability mode.

### Kills

- When you kill another player you collect their cards in your hand, but you must
  discard such that you have no more than three cards in your hand.

### Aces

- If you draw an ace when you search, immediately play it face up and immediately
  draw a new card from the discard pile.
- If you hold all four aces, you win.
- A player can always elect to play an ace as a face value of one for its suit if
  they wish, but it will be discarded as normal in that case.
- Face up aces do not count against the player's hand size.

## Special abilities

Face cards have special abilities **if special abilities are enabled for the game
at game start**.

### Clubs

- **Jack of clubs — exploding sniper.** If target is wearing a shield, instantly
  wipes the shield and deals 1d6 health damage. Can shoot the first enemy any
  number of spaces in a single direction in [up, down, left, right].
- **Queen of clubs — piercing sniper.** If target is wearing a shield, instantly
  wipes the shield. If target is not wearing a shield, instantly kills. Shoots
  the first two enemies in a row in any single direction from [up, down, left,
  right].
- **King of clubs — dual shotguns.** Pick two directions from up, down, left, and
  right. Deals 6 damage in scatter shot in both directions. A scatter shot is a 1
  unit ranged attack that damages left and right of the target cell in addition to
  the selected target cell.

### Hearts

- **Jack of hearts — regen.** Fully heal. Roll 1d6 and call the result K. For the
  next K turns, heal 1 each turn (to a max of 6 health).
- **Queen of hearts — regen with overheal.** Fully heal. Roll 1d6 and call the
  result K. For the next K turns, heal 1 each turn (to a max of 12 health).
- **King of hearts — auto-revive.** If you are killed, show this card from your
  hand and discard it. Restore to full health.

### Spades

- Jack, queen and king of spades are overshields worth 2, 4, or 6 points. A player
  can equip an overshield and armor at the same time. When an overshield is
  destroyed, no damage carries to the armor.

### Diamonds

- **Jack of diamonds — super mobility.** Move one space for free. You can play
  this on another player's turn.
- **Queen of diamonds — teleport.** Move anywhere on the map.
- **King of diamonds — blitzkrieg.** Get +1 action. You can reload for free
  without spending action points this turn.

## Notes

The rules above are the authoritative rules of the game. Points they leave open
(how much damage a weapon deals, how far it shoots, how much a heart heals, how
a player is knocked out) are settled for table play and for this repo's
implementation in [HOUSE_RULES.md](./HOUSE_RULES.md).
