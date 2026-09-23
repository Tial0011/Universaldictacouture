import test from "node:test";
import assert from "node:assert/strict";
import { prepareMessage, mergeMessages, closetEnquiry, MESSAGE_LIMIT } from "../src/services/chatModel.js";

test("closet enquiry preserves selected options and product references without asserting an order", () => {
  const draft = closetEnquiry([{ name: "Aso Oke set", slug: "aso-oke", quantity: 2, selections: { Size: "M", Colour: "Wine" } }]);
  assert.match(draft, /Aso Oke set \(quantity: 2\)/);
  assert.match(draft, /Size: M, Colour: Wine/);
  assert.match(draft, /\/shop\/aso-oke/);
  assert.equal(prepareMessage(draft), draft);
});

test("a large closet produces a valid message with a clear note about remaining selections", () => {
  const lines = Array.from({ length: 100 }, (_, index) => ({ name: `Piece ${index}`, productId: `piece-${index}`, quantity: 1, selections: { Fabric: "Aso Oke" } }));
  const draft = closetEnquiry(lines);
  assert.ok(draft.length <= MESSAGE_LIMIT);
  assert.match(draft, /more selection\(s\) to discuss/);
  assert.equal(prepareMessage(draft), draft);
});
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
