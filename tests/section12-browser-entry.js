import { connectAuthEmulator, signOut } from "firebase/auth";
import { connectFirestoreEmulator } from "firebase/firestore";
import { auth } from "../src/firebase/auth";
import { db } from "../src/firebase/firestore";
if (import.meta.env.MODE !== "section12-test" || !["127.0.0.1", "localhost"].includes(location.hostname)) throw Error("Local emulator QA only");
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
connectFirestoreEmulator(db, "127.0.0.1", 8089);
// Browser reload QA reconnects the same isolated emulators without ending
// the persisted session. Ordinary fixture entry still starts signed out.
if (!new URL(import.meta.url).searchParams.has("preserveSession")) await signOut(auth);
// The dedicated synthetic fixture database is rebuilt for each QA run, so
// discard only this isolated browser's old synthetic operation references.
for (const key of Object.keys(sessionStorage)) if (key.startsWith("udc:staff-operation:")) sessionStorage.removeItem(key);
history.replaceState({}, "", "/admin");
await import("../src/main.jsx");
