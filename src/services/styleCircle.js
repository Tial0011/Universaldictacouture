/**
 * Style Circle subscriptions.
 *
 * Subscriber addresses are write-only from the public site: the email
 * is hashed into the document ID so a duplicate signup is detected
 * with a single write, and no read access to the collection is ever
 * needed by the client. Firestore rules must allow create and deny
 * read/list on this collection.
 */

import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase/firestore";
import { isFirebaseConfigured } from "../firebase/config";

const COLLECTION = "styleCircleSubscribers";

// Deliberately permissive but real: catches the mistakes people
// actually make without rejecting valid, unusual addresses.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(value) {
  const email = String(value ?? "").trim();
  if (!email) return { isValid: false, message: "Enter your email address." };
  if (!EMAIL_PATTERN.test(email)) {
    return { isValid: false, message: "Enter a valid email address." };
  }
  return { isValid: true, email: email.toLowerCase() };
}

/** Stable, non-reversible-enough document key derived from the address. */
async function emailKey(email) {
  if (globalThis.crypto?.subtle) {
    const data = new TextEncoder().encode(email);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  // Non-secure contexts (rare) fall back to an encoded key.
  return encodeURIComponent(email).replace(/[.#$/[\]]/g, "_");
}

export class SubscriptionError extends Error {}
export class DuplicateSubscriptionError extends Error {}

/**
 * @returns {Promise<{ status: "subscribed" }>}
 * @throws {DuplicateSubscriptionError|SubscriptionError}
 */
export async function subscribeToStyleCircle(rawEmail) {
  const { isValid, email, message } = validateEmail(rawEmail);
  if (!isValid) throw new SubscriptionError(message);

  if (!isFirebaseConfigured) {
    throw new SubscriptionError("Style Circle is not available right now. Please try again later.");
  }

  const key = await emailKey(email);

  try {
    // createOnly: a second signup with the same address is rejected by
    // Firestore rather than silently overwritten.
    await setDoc(
      doc(db, COLLECTION, key),
      { email, source: "style-circle", createdAt: serverTimestamp() },
      { merge: false }
    );
    return { status: "subscribed" };
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);
    if (error?.code === "permission-denied") {
      // Rules reject a write to an existing document, which is how a
      // duplicate presents itself when reads are not permitted.
      throw new DuplicateSubscriptionError("You are already part of the Style Circle.");
    }
    throw new SubscriptionError("Style Circle could not be reached. Please try again.");
  }
}
