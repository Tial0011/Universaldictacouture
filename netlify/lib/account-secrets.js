import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
export function sealControlValue(value, secret) {
  const iv = randomBytes(12), key = createHash("sha256").update(secret).digest();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const bytes = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), bytes: bytes.toString("base64") };
}
export function openControlValue(value, secret) {
  const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(value.bytes, "base64")), decipher.final()]).toString("utf8");
}
