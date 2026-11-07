/**
 * Typed error classes for the engine.
 *
 * External input (project JSON, effect packs) never throws — parsers return
 * these error objects instead. Internal invariant violations (duplicate effect
 * registration, invalid effect params at apply time) are thrown so callers can
 * distinguish programming errors from data errors.
 */

/** Raised when project JSON fails to parse or exceeds the size limit. */
export class ParseError extends Error {
  readonly code: "PARSE_ERROR" | "SIZE_LIMIT_EXCEEDED";
  readonly cause?: unknown;

  constructor(
    message: string,
    code: "PARSE_ERROR" | "SIZE_LIMIT_EXCEEDED",
    cause?: unknown,
  ) {
    super(message);
    this.name = "ParseError";
    this.code = code;
    this.cause = cause;
  }
}

/** Raised when a project's schemaVersion is newer than the engine supports. */
export class MigrationError extends Error {
  readonly code: "FUTURE_VERSION";
  readonly version: number;

  constructor(message: string, version: number) {
    super(message);
    this.name = "MigrationError";
    this.code = "FUTURE_VERSION";
    this.version = version;
  }
}

/** Thrown when an effect id is registered more than once. */
export class DuplicateEffectError extends Error {
  readonly effectId: string;

  constructor(message: string, effectId: string) {
    super(message);
    this.name = "DuplicateEffectError";
    this.effectId = effectId;
  }
}

/** Thrown when an effect's params fail validation at apply time. */
export class InvalidEffectParamsError extends Error {
  readonly effectId: string;
  readonly cause: unknown;

  constructor(message: string, effectId: string, cause: unknown) {
    super(message);
    this.name = "InvalidEffectParamsError";
    this.effectId = effectId;
    this.cause = cause;
  }
}
