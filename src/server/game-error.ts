/** A rule or request failure that maps cleanly onto an HTTP status. */
export class GameError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'GameError';
    this.status = status;
  }
}
