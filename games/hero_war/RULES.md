# Hero War

**Props:** one or more standard poker decks.

Hero War is based on the card game "War" but instantiates a "Hero" concept with
equipment and abilities for strategy.

## Rules (as authored)

- Default to two players, though more is possible.
- Let each player draw five cards.
- The player can play any face card as their hero. If they draw no face card,
  show the opponent, shuffle, and draw again.
- Each turn, a player can draw, play a card, and choose to attack or pass from
  attacking.
- A hero deals its face value in damage, plus bonuses.
- Club cards are equipment. A hero can wear any number of clubs, which boost
  damage and persist across turns.
- Hearts are healing spells. When a player is attacked, they can discard a heart
  to nullify the attack.
- Diamonds are power spells. When a player attacks, they can discard a diamond to
  increase their attack damage for this attack only.
- Spades are tools of trade. A spade can be discarded to destroy an opponent's
  equipped club card or it can be discarded to draw a replacement card without
  using an action. That is: I can discard my spade, draw, and play another card on
  the same turn.
- When a player's hero dies, they can play a new hero if they have one in their
  hand. If a player has no heros in their hand then they are out, and the last
  player standing wins.

## Notes

The rules above are the authoritative rules of the game. Points they leave open
(hero hit points, the size of a club's damage boost, deck exhaustion, and so on)
are settled for table play and for this repo's implementation in
[HOUSE_RULES.md](./HOUSE_RULES.md).
