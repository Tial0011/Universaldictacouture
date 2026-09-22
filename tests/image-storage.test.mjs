import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createImageHandler, requireAdmin, MAX_IMAGE_BYTES } from "../netlify/lib/image-storage.js";
const url = "https://example.test/.netlify/functions/images";
function setup(authorize = async () => "admin-id") {
  const blobs = new Map();
  const handler = createImageHandler({ authorize, getStore: () => ({
    set: async (key, data) => { blobs.set(key, data); },
    get: async key => blobs.get(key) || null,
  }) });
  return { handler, blobs };
}
test("signed-out uploads cannot write to storage", async () => {
  const {handler, blobs} = setup(request => requireAdmin(request, {}));
  const response = await handler(new Request(url, { method: "POST", body: "invalid" }));
  assert.equal(response.status, 401);
  assert.equal(blobs.size, 0);
});
test("Firebase membership check rejects non-admin and disabled accounts", async () => {
  const request = new Request(url, { headers: { Authorization: "Bearer test-token" } });
  const env = { FIREBASE_WEB_API_KEY: "test-key", FIREBASE_PROJECT_ID: "test-project" };
  for (const active of [false, true]) {
    const responses = [Response.json({ users: [{ localId: "user" }] }), Response.json({ fields: { active: { booleanValue: active } } })];
    const check = requireAdmin(request, env, async () => responses.shift());
    if (active) assert.equal(await check, "user");
    else await assert.rejects(check, error => error.status === 403);
  }
  await assert.rejects(requireAdmin(request, env, async () => Response.json({users:[{localId:"user",disabled:true}]})), error => error.status === 401);
  await assert.rejects(requireAdmin(request, env, async () => Response.json({error:{}},{status:400})), error => error.status === 401);
});
test("invalid images, spoofed types and oversized bodies never reach storage", async () => {
  const {handler, blobs} = setup();
  const fake = await handler(new Request(url, {method:"POST",headers:{"Content-Type":"image/png"},body:"not an image"}));
  assert.equal(fake.status, 415);
  const svg = await handler(new Request(url, {method:"POST",headers:{"Content-Type":"image/svg+xml"},body:"<svg/>"}));
  assert.equal(svg.status, 415);
  const huge = await handler(new Request(url, {method:"POST",headers:{"Content-Type":"image/png"},body:Buffer.alloc(MAX_IMAGE_BYTES+1)}));
  assert.equal(huge.status, 413);
  assert.equal(blobs.size, 0);
});
test("valid image is stored, served and readable immediately as WebP", async () => {
  const {handler, blobs} = setup();
  const png = await sharp({create:{width:12,height:10,channels:3,background:"#601013"}}).png().toBuffer();
  const upload = await handler(new Request(url,{method:"POST",headers:{"Content-Type":"image/png"},body:png}));
  assert.equal(upload.status, 201);
  const image = await upload.json();
  assert.equal(image.provider, "netlify");
  assert.equal(blobs.size, 1);
  const served = await handler(new Request(new URL(image.url,url)));
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("content-type"), "image/webp");
  const metadata = await sharp(Buffer.from(await served.arrayBuffer())).metadata();
  assert.equal(metadata.width, 12);
  assert.equal(metadata.height, 10);
  assert.equal(metadata.format, "webp");
  const head = await handler(new Request(new URL(image.url,url),{method:"HEAD"}));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});
test("unknown images and unsupported operations are handled safely", async () => {
  const {handler} = setup();
  assert.equal((await handler(new Request(url+"?key=../../other"))).status,404);
  assert.equal((await handler(new Request(url+"?key=00000000-0000-0000-0000-000000000000.webp"))).status,404);
  assert.equal((await handler(new Request(url,{method:"DELETE"}))).status,405);
});
