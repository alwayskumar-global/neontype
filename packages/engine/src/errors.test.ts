import { describe, expect, it } from "vitest";
import {
  DuplicateEffectError,
  InvalidEffectParamsError,
  MigrationError,
  ParseError,
} from "./errors.js";

describe("typed error classes", () => {
  it("ParseError is an Error, keeps its name, code, and optional cause", () => {
    const cause = new Error("inner");
    const err = new ParseError("bad json", "PARSE_ERROR", cause);

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ParseError);
    expect(err.name).toBe("ParseError");
    expect(err.message).toBe("bad json");
    expect(err.code).toBe("PARSE_ERROR");
    expect(err.cause).toBe(cause);
  });

  it("ParseError supports the SIZE_LIMIT_EXCEEDED code and omitted cause", () => {
    const err = new ParseError("too big", "SIZE_LIMIT_EXCEEDED");

    expect(err).toBeInstanceOf(ParseError);
    expect(err.code).toBe("SIZE_LIMIT_EXCEEDED");
    expect(err.cause).toBeUndefined();
  });

  it("MigrationError is an Error, keeps its name, code, and version", () => {
    const err = new MigrationError("too new", 999);

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(MigrationError);
    expect(err.name).toBe("MigrationError");
    expect(err.message).toBe("too new");
    expect(err.code).toBe("FUTURE_VERSION");
    expect(err.version).toBe(999);
  });

  it("DuplicateEffectError is an Error, keeps its name and effectId", () => {
    const err = new DuplicateEffectError("already registered", "fade-slide");

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DuplicateEffectError);
    expect(err.name).toBe("DuplicateEffectError");
    expect(err.message).toBe("already registered");
    expect(err.effectId).toBe("fade-slide");
  });

  it("InvalidEffectParamsError is an Error, keeps its name, effectId, and cause", () => {
    const cause = { issues: [] };
    const err = new InvalidEffectParamsError("bad params", "typewriter", cause);

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(InvalidEffectParamsError);
    expect(err.name).toBe("InvalidEffectParamsError");
    expect(err.message).toBe("bad params");
    expect(err.effectId).toBe("typewriter");
    expect(err.cause).toBe(cause);
  });

  it("the four error classes are distinct and do not cross-match instanceof", () => {
    const parse = new ParseError("x", "PARSE_ERROR");
    const migration = new MigrationError("x", 2);
    const duplicate = new DuplicateEffectError("x", "id");
    const invalid = new InvalidEffectParamsError("x", "id", undefined);

    expect(parse).not.toBeInstanceOf(MigrationError);
    expect(migration).not.toBeInstanceOf(ParseError);
    expect(duplicate).not.toBeInstanceOf(InvalidEffectParamsError);
    expect(invalid).not.toBeInstanceOf(DuplicateEffectError);
  });
});
