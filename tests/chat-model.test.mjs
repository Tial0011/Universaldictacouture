import test from "node:test";
import assert from "node:assert/strict";
import { prepareMessage, mergeMessages } from "../src/services/chatModel.js";
test("empty and oversized messages are rejected, meaningful whitespace preserved", () => {
  for (const value of [null, "  ", "\n\t", "x".repeat(2001)]) assert.throws(() => prepareMessage(value));
  assert.equal(prepareMessage("  Hello\nPlease help  "), "Hello\nPlease help");
  assert.equal(prepareMessage("x".repeat(2000)).length, 2000);
});
test("overlapping history pages do not duplicate messages and server acknowledgement replaces pending data", () => {
  const stamp = value => ({ toMillis: () => value });
  const old = { id: "old", createdAt: stamp(1) };
  const pending = { id: "sent", createdAt: null, pending: true };
  const confirmed = { id: "sent", createdAt: stamp(2), pending: false };
  const next = { id: "next", createdAt: stamp(3) };
  assert.deepEqual(mergeMessages([pending, old], [confirmed, next, old]).map(x => [x.id, x.pending]), [["old", undefined], ["sent", false], ["next", undefined]]);
});
