import test from "node:test";
import assert from "node:assert/strict";
import { maskEmail, safeReturnPath } from "../src/services/authFlow.js";

test("safe auth returns stay on allowlisted internal customer routes", () => {
  assert.equal(safeReturnPath("/shop?focus=search"), "/shop?focus=search");
  assert.equal(safeReturnPath("/chats#latest"), "/chats#latest");
  assert.equal(safeReturnPath("https://evil.example/phish", "/"), "/");
  assert.equal(safeReturnPath("//evil.example/phish", "/profile"), "/profile");
  assert.equal(safeReturnPath("/admin", "/profile"), "/profile");
});

test("email masking preserves destination domain without exposing the full local part", () => {
  assert.equal(maskEmail("christolite@example.com"), "ch••••••••@example.com");
  assert.equal(maskEmail("a@example.com"), "a•••@example.com");
});
