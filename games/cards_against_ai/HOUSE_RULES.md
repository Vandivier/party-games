# Cards Against AI — House Rules

[RULES.md](./RULES.md) is authoritative. This file fills the gaps it leaves open
so the game can be played (and implemented) without arguing. Every entry below is
a default choice, not part of the authored rules.

## The decks

- Both decks ship with this repo: see `cards.ts`. Input Cards carry a tone —
  silly, mundane, or academic — so a table can see the mix the rules ask for.
- When a deck runs out, shuffle its discard pile to make a new one. Played Output
  Cards and spent Input Cards go to their own discard piles.

## A round

1. An Input Card is turned face up.
2. Everyone plays one Output Card face down, in any order — nobody waits for a
   turn.
3. When the last card is down they are shuffled together and turned face up, with
   no indication of who played what.
4. Everyone votes for a card that is not their own. Votes are hidden until the
   last one is in.
5. The most-voted card wins the round; on a tie, every tied player scores. Then
   authorship is revealed, hands refill to five, and the next Input Card comes
   out.

Seven points ends the game. If more than one player crosses seven in the same
round, they win together.

## Three players minimum

Two players cannot vote for themselves, so each would vote for the other and
every round would end 1–1 — a race with no tension. The game therefore starts at
three, and a bot counts as a third.

## Voting

- Nobody may abstain: a round waits for every player's vote.
- With three or more players there is always at least one card to vote for that
  is not your own.

## Bots

Bots submit a card at random from their hand and vote at random for somebody
else's. They are there to fill seats and break ties, not to be funny — the humour
is entirely in which card a person picks for which prompt.
