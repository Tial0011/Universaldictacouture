import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase/firestore";
import { isFirebaseConfigured } from "../firebase/config";
import heroReadyToWear from "../assets/images/hero/hero-ready-to-wear.jpg";

export const DEFAULT_AUTH_APPEARANCE = {
  eyebrow: "A HERITAGE YOU WEAR",
  headline: "Timeless Tradition. Modern You.",
  supportingText: "Beautifully crafted Aso Oke for every occasion. Classic, elegant and proudly Nigerian.",
  image: { url: heroReadyToWear, publicId: "", alt: "Universal Dicta Couture fashion portrait" },
};

function normaliseImage(image) {
  if (!image) return null;
  if (typeof image === "string") return { url: image, publicId: "", alt: "" };
  const url = image.url || image.secureUrl || image.secure_url || "";
  const publicId = image.publicId || image.public_id || "";
  if (!url && !publicId) return null;
  return { url, publicId, alt: String(image.alt || "") };
}

export function normaliseAuthAppearance(raw = {}) {
  return {
    eyebrow: String(raw.eyebrow || DEFAULT_AUTH_APPEARANCE.eyebrow).slice(0, 80),
    headline: String(raw.headline || DEFAULT_AUTH_APPEARANCE.headline).slice(0, 120),
    supportingText: String(raw.supportingText || DEFAULT_AUTH_APPEARANCE.supportingText).slice(0, 260),
    image: normaliseImage(raw.image) || DEFAULT_AUTH_APPEARANCE.image,
    usingDefaultImage: !normaliseImage(raw.image),
  };
}

export async function fetchAuthAppearance() {
  if (!isFirebaseConfigured || !db) return normaliseAuthAppearance();
  try {
    const snapshot = await getDoc(doc(db, "siteAppearance", "auth"));
    return normaliseAuthAppearance(snapshot.exists() ? snapshot.data() : {});
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);
    return normaliseAuthAppearance();
  }
}

export async function loadAuthAppearanceAdmin() {
  if (!db) throw new Error("Connect Firebase before managing website appearance.");
  const snapshot = await getDoc(doc(db, "siteAppearance", "auth"));
  return snapshot.exists() ? { ...snapshot.data(), id: "auth" } : { id: "auth", ...DEFAULT_AUTH_APPEARANCE };
}

export async function saveAuthAppearanceAdmin(raw) {
  if (!db) throw new Error("Connect Firebase before managing website appearance.");
  const eyebrow = String(raw.eyebrow || "").trim();
  const headline = String(raw.headline || "").trim();
  const supportingText = String(raw.supportingText || "").trim();
  if (!eyebrow || !headline || !supportingText) throw new Error("Complete the authentication hero text before saving.");
  if (eyebrow.length > 80 || headline.length > 120 || supportingText.length > 260) throw new Error("Keep the appearance copy within the stated limits.");
  await setDoc(doc(db, "siteAppearance", "auth"), {
    eyebrow,
    headline,
    supportingText,
    image: raw.image || null,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function resetAuthAppearanceAdmin() {
  if (!db) throw new Error("Connect Firebase before managing website appearance.");
  await deleteDoc(doc(db, "siteAppearance", "auth"));
}
