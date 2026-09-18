import { getFirestore } from "firebase/firestore";
import app, { isFirebaseConfigured } from "./config";

/**
 * The shared Firestore instance, or null while Firebase is
 * unconfigured. Every caller in src/services already checks
 * isFirebaseConfigured before touching it, so an unconfigured build
 * simply reports its truthful unavailable state instead of crashing.
 */
export const db = isFirebaseConfigured ? getFirestore(app) : null;

// Collection-specific query/mutation helpers belong in src/services,
// built on top of this shared Firestore instance. Keep this file
// limited to instance setup so it stays stable as later phases add
// data models (products, reviews, closet items, chats, etc.).
