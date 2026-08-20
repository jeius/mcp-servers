export class ServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServerError';
  }
}

export class UnknownServerError extends ServerError {
  readonly known: readonly string[];

  constructor(name: string, known: readonly string[]) {
    const list = known.length > 0 ? `Known: ${known.join(', ')}` : 'Known: (none)';
    super(`no server named "${name}". ${list}`);
    this.name = 'UnknownServerError';
    this.known = known;
  }
}

export class NoBinError extends ServerError {
  constructor(name: string) {
    super(`"${name}" has no bin; not a server`);
    this.name = 'NoBinError';
  }
}

export class BuildFailedError extends ServerError {
  readonly code: number;

  constructor(name: string, code: number) {
    super(`build failed for "${name}"; see turbo output above`);
    this.name = 'BuildFailedError';
    this.code = code;
  }
}

export class MissingEntryError extends ServerError {
  constructor(entry: string) {
    super(`built but no entry at ${entry}`);
    this.name = 'MissingEntryError';
  }
}
