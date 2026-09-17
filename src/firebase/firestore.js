import { getFirestore } from "firebase/firestore";
import app from "./config";

export const db = getFirestore(app);

// Collection-specific query/mutation helpers belong in src/services,
// built on top of this shared Firestore instance. Keep this file
// limited to instance setup so it stays stable as later phases add
// data models (products, reviews, closet items, chats, etc.).
