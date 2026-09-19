/**
 * Editorial / merchandising content: hero slides, discovery modules
 * and the published review feed.
 *
 * Everything here is admin-managed in Firestore. Where no admin
 * content exists yet, the site falls back to the approved
 * specification copy (hero) or to the taxonomy that genuinely exists
 * in the published catalogue (discovery) — never to invented
 * products, claims or testimonials.
 */

import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../firebase/firestore";
import { isFirebaseConfigured } from "../firebase/config";
import heroReadyToWear from "../assets/images/hero/hero-ready-to-wear.jpg";

/** The only hero concepts the specification approves. */
export const APPROVED_HERO_CONCEPTS = [
  "ready-to-wear",
  "aso-oke-fabric",
  "custom-style",
  "shop-by-occasion",
  "bridal-event-dressing",
];

/** The approved hero copy. Admin slides may override the imagery and concept. */
export const APPROVED_HERO_COPY = {
  eyebrow: "PREMIUM ASO OKE",
  headline: "Timeless Tradition",
  secondary: "Modern You",
  body: "Beautifully crafted Aso Oke for every occasion. Classic, elegant and proudly Nigerian.",
  primaryCta: { label: "Shop the Collection", to: "/shop" },
  secondaryCta: { label: "Explore All Styles", to: "/shop" },
};

/** Approved Shop by Occasion examples, used only when they exist in the catalogue. */
export const APPROVED_OCCASION_EXAMPLES = [
  "Wedding Guest",
  "Bridal",
  "Traditional Engagement",
  "Celebration",
  "Church/Event",
];

function normaliseImage(image) {
  if (!image) return null;
  if (typeof image === "string") return { url: image, publicId: "", alt: "" };
  const url = image.url || image.secureUrl || image.secure_url || "";
  const publicId = image.publicId || image.public_id || "";
  if (!url && !publicId) return null;
  return { url, publicId, alt: image.alt || "" };
}

function byOrder(a, b) {
  return (a.order ?? 0) - (b.order ?? 0);
}

/**
 * Hero slides. Returns the approved single editorial slide when no
 * admin slides are published.
 */
export async function fetchHeroSlides() {
  const fallback = [
    {
      id: "approved-primary",
      concept: "ready-to-wear",
      ...APPROVED_HERO_COPY,
      image: { url: heroReadyToWear, publicId: "", alt: "" },
      order: 0,
    },
  ];

  if (!isFirebaseConfigured) return fallback;

  try {
    const snapshot = await getDocs(
      query(collection(db, "heroSlides"), where("published", "==", true), limit(12))
    );

    const slides = snapshot.docs
      .map((entry) => {
        const data = entry.data() ?? {};
        const concept = String(data.concept ?? "").toLowerCase();
        if (!APPROVED_HERO_CONCEPTS.includes(concept)) return null;
        return {
          id: entry.id,
          concept,
          eyebrow: data.eyebrow ? String(data.eyebrow) : APPROVED_HERO_COPY.eyebrow,
          headline: data.headline ? String(data.headline) : APPROVED_HERO_COPY.headline,
          secondary: data.secondary ? String(data.secondary) : APPROVED_HERO_COPY.secondary,
          body: data.body ? String(data.body) : APPROVED_HERO_COPY.body,
          primaryCta: APPROVED_HERO_COPY.primaryCta,
          secondaryCta: APPROVED_HERO_COPY.secondaryCta,
          image: normaliseImage(data.image),
          imageMobile: normaliseImage(data.imageMobile),
          order: Number(data.order) || 0,
        };
      })
      .filter(Boolean)
      .sort(byOrder);

    return slides.length ? slides : fallback;
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);
    return fallback;
  }
}

/**
 * An admin-managed discovery module for a placement ("home" | "shop").
 * Returns null when nothing is published for that placement.
 */
export async function fetchDiscoveryModule(placement) {
  if (!isFirebaseConfigured) return null;

  try {
    const snapshot = await getDocs(
      query(
        collection(db, "discoveryModules"),
        where("placement", "==", placement),
        where("active", "==", true),
        limit(4)
      )
    );

    const modules = snapshot.docs
      .map((entry) => {
        const data = entry.data() ?? {};
        const groups = (Array.isArray(data.groups) ? data.groups : [])
          .map((group, index) => ({
            id: group?.id ? String(group.id) : `group-${index}`,
            label: group?.label ? String(group.label) : "",
            order: Number(group?.order) || index,
          }))
          .filter((group) => group.label)
          .sort(byOrder);

        const items = (Array.isArray(data.items) ? data.items : [])
          .map((item, index) => ({
            id: item?.id ? String(item.id) : `item-${index}`,
            name: item?.name ? String(item.name).trim() : "",
            image: normaliseImage(item?.image),
            destination: item?.destination ? String(item.destination).trim() : "",
            group: item?.group ? String(item.group) : "",
            order: Number(item?.order) || index,
            published: item?.published !== false,
          }))
          // Hide empty or invalid items rather than rendering a dead card.
          .filter((item) => item.published && item.name && item.destination.startsWith("/"))
          .sort(byOrder);

        return {
          id: entry.id,
          title: data.title ? String(data.title) : "Shop by Occasion",
          placement,
          order: Number(data.order) || 0,
          groups,
          items,
        };
      })
      .filter((module) => module.items.length > 0)
      .sort(byOrder);

    return modules[0] ?? null;
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);
    return null;
  }
}

/**
 * Discovery fallback built from the occasions that genuinely exist in
 * the published catalogue, so a tile never leads to an empty result.
 */
export function buildOccasionDiscovery(products, title = "Shop by Occasion") {
  const available = new Set();
  products.forEach((product) => {
    product.occasion.forEach((value) => available.add(value.trim()));
  });

  const items = APPROVED_OCCASION_EXAMPLES.filter((occasion) =>
    available.has(occasion)
  ).map((occasion, index) => ({
    id: `occasion-${index}`,
    name: occasion,
    image: null,
    destination: `/shop?occasion=${encodeURIComponent(occasion)}`,
    group: "",
    order: index,
    published: true,
  }));

  if (!items.length) return null;
  return { id: "occasion-fallback", title, groups: [], items };
}

/**
 * Custom Style homepage promotion image. Admin-managed, single
 * document; returns a null image (never a stand-in photo) when
 * nothing has been published yet or Firebase is disabled.
 */
export async function fetchCustomStylePromo() {
  const fallback = { image: null };
  if (!isFirebaseConfigured) return fallback;

  try {
    const snapshot = await getDocs(
      query(collection(db, "homeSections"), where("section", "==", "customStyle"), limit(1))
    );
    const entry = snapshot.docs[0];
    if (!entry) return fallback;
    const data = entry.data() ?? {};
    return { image: normaliseImage(data.image) };
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);
    return fallback;
  }
}

/** Published review / feed entries for the homepage preview. */
export async function fetchPublishedReviews(max = 3) {
  if (!isFirebaseConfigured) return [];

  try {
    const snapshot = await getDocs(
      query(collection(db, "reviews"), where("published", "==", true), limit(max))
    );

    return snapshot.docs
      .map((entry) => {
        const data = entry.data() ?? {};
        const body = data.body ? String(data.body).trim() : "";
        if (!body) return null;
        return {
          id: entry.id,
          body,
          author: data.author ? String(data.author).trim() : "",
          image: normaliseImage(data.image),
        };
      })
      .filter(Boolean);
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);
    return [];
  }
}
