export class DomainCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainCommandError";
  }
}
