import { describe, it, expect } from "vitest";
import { reduceExitCode } from "../src/commands/translate";

describe("reduceExitCode", () => {
  it.each([
    [[], 0],
    [[0, 0], 0],
    [[2], 2],
    [[2, 1], 1],
    [[1, 2], 1],
    [[3, 1, 2], 3],
    [[2, 3], 3],
    [[1, 3], 3],
    [[0, 2, 0], 2],
  ])("%j → %i (precedence 3 > 1 > 2 > 0)", (outcomes, expected) => {
    expect(reduceExitCode(outcomes)).toBe(expected);
  });
});
