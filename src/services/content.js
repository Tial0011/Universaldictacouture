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
import collectionPlaceholder1 from "../assets/images/collection/collection-placeholder-1.jpg";
import collectionPlaceholder2 from "../assets/images/collection/collection-placeholder-2.jpg";
import collectionPlaceholder3 from "../assets/images/collection/collection-placeholder-3.jpg";
import occasionWeddingGuest from "../assets/images/occasions/wedding-guest.jpg";
import occasionBridal from "../assets/images/occasions/bridal.jpg";
import occasionEngagement from "../assets/images/occasions/traditional-engagement.jpg";
import occasionCelebration from "../assets/images/occasions/celebration.jpg";
import occasionChurchEvent from "../assets/images/occasions/church-event.jpg";

/**
 * Stand-in photography for the Shop by Occasion / Shop By tiles on
 * both Home and Shop, used only while no real occasion photos have
 * been published (see approvedOccasionPlaceholders below). Each
 * approved occasion has its own fabric photograph (cut from the Shop
 * mockup — low resolution, stand-ins only), so each tile can later be
 * swapped for a real photo independently. Any occasion without one
 * falls back to cycling the three generic placeholders.
 */
const OCCASION_STAND_IN_IMAGES = {
  "Wedding Guest": occasionWeddingGuest,
  Bridal: occasionBridal,
  "Traditional Engagement": occasionEngagement,
  Celebration: occasionCelebration,
  "Church/Event": occasionChurchEvent,
};

const COLLECTION_PLACEHOLDER_IMAGES = [
  collectionPlaceholder1,
  collectionPlaceholder2,
  collectionPlaceholder3,
];

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
 * The five approved occasions with no photography yet — used only
 * when neither an admin discovery module nor the published catalogue
 * has anything to show, so the section still appears (with an
 * illustration standing in per item; see OccasionIllustration) rather
 * than being invisible until photos exist. These are the approved
 * taxonomy, not invented categories.
 */
export function approvedOccasionPlaceholders(title = "Shop by Occasion") {
  const items = APPROVED_OCCASION_EXAMPLES.map((occasion, index) => ({
    id: `occasion-${index}`,
    name: occasion,
    image: {
      url:
        OCCASION_STAND_IN_IMAGES[occasion] ??
        COLLECTION_PLACEHOLDER_IMAGES[index % COLLECTION_PLACEHOLDER_IMAGES.length],
      publicId: "",
      alt: "",
    },
    destination: `/shop?occasion=${encodeURIComponent(occasion)}`,
    group: "",
    order: index,
    published: true,
  }));
  return { id: "occasion-approved", title, groups: [], items };
}

/**
 * Shop discovery: three tabs — Occasion, Style, Fabric & Pattern — each
 * built from values that genuinely exist on the given pieces, so a
 * tile never leads to an empty result. Occasion keeps to the approved
 * occasions (in their approved order); Style and Fabric & Pattern list
 * whatever the pieces carry, most-used first. Each tile borrows the
 * photograph of a piece that has that value.
 *
 * Tabs with nothing behind them are left out, and null is returned
 * when no tab has anything (callers then fall back to the approved
 * occasion placeholders).
 */
const SHOP_DISCOVERY_GROUPS = [
  { id: "occasion", label: "Occasion", key: "occasion", param: "occasion", approved: APPROVED_OCCASION_EXAMPLES },
  { id: "style", label: "Style", key: "style", param: "style" },
  { id: "fabric", label: "Fabric & Pattern", key: "fabric", param: "fabric" },
];

const SHOP_DISCOVERY_MAX_PER_GROUP = 12;

export function buildShopDiscovery(products, title = "Shop By") {
  const groups = [];
  const items = [];

  SHOP_DISCOVERY_GROUPS.forEach((group) => {
    // Keyed case-insensitively (Shop filters match that way too), but
    // shown in the casing first seen.
    const found = new Map();

    products.forEach((product) => {
      (product[group.key] ?? []).forEach((raw) => {
        const trimmed = String(raw).trim();
        if (!trimmed) return;

        const approvedName = group.approved?.find(
          (name) => name.toLowerCase() === trimmed.toLowerCase()
        );
        if (group.approved && !approvedName) return;

        const name = approvedName ?? trimmed;
        const entry = found.get(name.toLowerCase()) ?? { name, count: 0, images: [] };
        entry.count += 1;
        const imageKey = product.image?.publicId || product.image?.url;
        if (imageKey && !entry.images.some((known) => (known.publicId || known.url) === imageKey)) {
          entry.images.push(product.image);
        }
        found.set(name.toLowerCase(), entry);
      });
    });

    if (!found.size) return;

    const ordered = group.approved
      ? group.approved
          .map((name) => found.get(name.toLowerCase()))
          .filter(Boolean)
      : [...found.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    groups.push({ id: group.id, label: group.label, order: groups.length });

    // Each tile borrows a photo of a piece that has its value, preferring
    // one no earlier tile in this tab already shows, so neighbouring
    // tiles do not repeat the same picture when there is a choice.
    const usedImages = new Set();
    ordered.slice(0, SHOP_DISCOVERY_MAX_PER_GROUP).forEach((entry, index) => {
      const image =
        entry.images.find((candidate) => !usedImages.has(candidate.publicId || candidate.url)) ??
        entry.images[0] ??
        null;
      if (image) usedImages.add(image.publicId || image.url);

      items.push({
        id: `${group.id}-${index}`,
        name: entry.name,
        image,
        destination: `/shop?${group.param}=${encodeURIComponent(entry.name)}`,
        group: group.id,
        order: index,
        published: true,
      });
    });
  });

  if (!items.length) return null;
  return { id: "shop-discovery", title, groups, items };
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
