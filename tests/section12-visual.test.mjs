import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { operationalPresentation } from "../src/services/operationalPresentation.js";
import { OPERATIONAL_STATES } from "../src/services/operationalRuntime.js";
const read = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");
test("state visual family accounts for every runtime state without granting authority or selecting recovery", () => {
  for (const state of OPERATIONAL_STATES) {
    const presentation = operationalPresentation(state);
    assert.ok(presentation.icon && presentation.title && presentation.tone);
    assert.deepEqual(Object.keys(presentation).sort(), ["icon", "title", "tone"]);
  }
  assert.notEqual(operationalPresentation("restricted").tone, operationalPresentation("source-unavailable").tone);
  assert.notEqual(operationalPresentation("loading").tone, operationalPresentation("unknown-result").tone);
  assert.notEqual(operationalPresentation("stale").tone, operationalPresentation("resolved-elsewhere").tone);
});
test("password reveal retains native form semantics and associated safe error copy", () => {
  const source = read("src/components/admin/AdminAccess.jsx");
  assert.match(source, /aria-pressed=\{passwordVisible\}/);
  assert.match(source, /aria-controls="admin-password"/);
  assert.match(source, /autoComplete="current-password"/);
  assert.match(source, /aria-describedby=\{error \? "admin-login-error"/);
  assert.doesNotMatch(source, /Keep me signed in|contact internal support|Lagos|Nigeria|Staff access confirmed/);
});
test("official artwork is retained instead of generated monograms or new font families", () => {
  const source = read("src/components/navigation/AdminLayout.jsx");
  assert.match(source, /<Logo variant="white"/);
  assert.match(source, /className="admin-topbar-brand"/);
  const css = read("src/components/admin/AdminVisual.css");
  assert.match(css, /var\(--font-body\)/);
  assert.match(css, /var\(--color-brand-deep\)/);
  assert.doesNotMatch(css, /@font-face|font-family:\s*["']/);
});
test("visual overlay preserves existing responsive breakpoint authority and has no bottom bar", () => {
  const css = read("src/components/admin/AdminVisual.css");
  assert.match(css, /min-width: 900px\) and \(max-width: 1399px/);
  assert.match(css, /max-width: 899px/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /forced-colors/);
  assert.doesNotMatch(css, /bottom-nav|mobile-bottom|position:\s*fixed/);
});
test("state styling preserves the existing safe-read retry allowlist", () => {
  const source = read("src/components/admin/OperationalState.jsx");
  assert.match(source, /\["connection-problem", "source-unavailable", "temporarily-unavailable", "retryable-error", "stale"\]/);
  assert.match(source, /data-operational-state=\{state\}/);
  assert.doesNotMatch(source, /navigate|setDoc|writeBatch|onCommit/);
});
test("outline icons are vendored real upstream SVG artwork with their licence", () => {
  const files = readdirSync(new URL("../src/assets/admin/icons/", import.meta.url));
  assert.ok(files.includes("LICENSE"));
  assert.ok(files.filter(file => file.endsWith(".svg")).length >= 20);
  assert.match(read("src/assets/admin/icons/LICENSE"), /MIT/);
  assert.doesNotMatch(read("src/components/admin/AdminIcon.jsx"), /<svg|<path|<circle/);
});
test("operational typography, foreground and focus colours meet normal text/control contrast", () => {
  const luminance = hex => {
    const components = hex.match(/\w\w/g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return components[0] * .2126 + components[1] * .7152 + components[2] * .0722;
  };
  const contrast = (first, second) => { const values = [luminance(first), luminance(second)].sort((a,b)=>b-a); return (values[0]+.05)/(values[1]+.05); };
  assert.ok(contrast("1f1f1f", "fbf8f2") >= 4.5);
  assert.ok(contrast("6b6b6b", "fbf8f2") >= 4.5);
  assert.ok(contrast("601013", "ffffff") >= 4.5);
  assert.ok(contrast("fbf8f2", "43090d") >= 4.5);
  assert.ok(contrast("601013", "fbf8f2") >= 3);
});
