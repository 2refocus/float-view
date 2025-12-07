export class ParseError extends Error {
  constructor(
    public readonly message: string,
    public readonly cause: unknown,
  ) {
    super(message);
  }
}

export class FloatControlLimitedError extends Error {
  constructor() {
    super(
      'This Float Control CSV appears to be from the free version, which unfortunately trims ride logs - displayed data will be incomplete.',
    );
  }
}
