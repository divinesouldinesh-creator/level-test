import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allocateByWeights } from "./allocateQuotas.js";

describe("allocateByWeights", () => {
  it("gives a larger bank more of the test", () => {
    const counts = allocateByWeights(
      10,
      new Map([
        ["big", 80],
        ["small", 20],
      ])
    );
    assert.equal(counts.get("big"), 8);
    assert.equal(counts.get("small"), 2);
  });

  it("sums to the test size", () => {
    const counts = allocateByWeights(
      10,
      new Map([
        ["a", 1],
        ["b", 1],
        ["c", 1],
      ])
    );
    const sum = [...counts.values()].reduce((s, n) => s + n, 0);
    assert.equal(sum, 10);
  });
});
