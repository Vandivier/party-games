/** Catalog metadata every game in this app registers with. */
export interface GameDefinition {
  /** URL-safe id, e.g. `hero-war`. */
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  /** Physical props needed to play the same game at a table. */
  readonly props: readonly string[];
  /** Repo path to the authored rules, or to the concept note for a planned game. */
  readonly rulesPath: string;
  /** Route to play it, or null while it is still on the drawing board. */
  readonly href: string | null;
  /** Route that renders the rules or concept note, if there is one. */
  readonly docsHref?: string;
  readonly status: 'playable' | 'planned';
}
