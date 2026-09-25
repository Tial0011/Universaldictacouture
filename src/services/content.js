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
import { DEFAULT_SHOP_BY_GROUPS } from "./shopBy";
import { normaliseReviewRecord, selectLatestPublishedReviews } from "./reviewModel";




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
  headline: "Modern Tradition",
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

  const items = [...available]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((occasion, index) => ({
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
 * Shop discovery is generated from the Shop By groups configured by the
 * admin and the values genuinely assigned to published products. The three
 * core groups are Occasion, Style and Fabric & Pattern, but extra groups can
 * be added without changing this builder. Empty groups remain visible so the
 * admin can immediately see which part of the catalogue still needs data.
 */
export const SHOP_DISCOVERY_GROUPS = DEFAULT_SHOP_BY_GROUPS;

const SHOP_DISCOVERY_MAX_PER_GROUP = 12;

export function buildShopDiscovery(products, title = "Shop By", groupDefinitions = SHOP_DISCOVERY_GROUPS) {
  const groups = [];
  const items = [];

  (groupDefinitions?.length ? groupDefinitions : SHOP_DISCOVERY_GROUPS).forEach((group) => {
    const key = group.key || group.id;
    if (!key || group.active === false) return;

    // Keyed case-insensitively, but shown in the casing first seen.
    const found = new Map();

    products.forEach((product) => {
      const values = product.shopBy?.[key] ?? product[key] ?? [];
      values.forEach((raw) => {
        const name = String(raw).trim();
        if (!name) return;
        const entry = found.get(name.toLowerCase()) ?? { name, count: 0, images: [] };
        entry.count += 1;
        const imageKey = product.image?.publicId || product.image?.url;
        if (imageKey && !entry.images.some((known) => (known.publicId || known.url) === imageKey)) {
          entry.images.push(product.image);
        }
        found.set(name.toLowerCase(), entry);
      });
    });

    groups.push({ id: group.id || key, label: group.label || key, order: groups.length });
    if (!found.size) return;

    const ordered = [...found.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const usedImages = new Set();
    ordered.slice(0, SHOP_DISCOVERY_MAX_PER_GROUP).forEach((entry, index) => {
      const image =
        entry.images.find((candidate) => !usedImages.has(candidate.publicId || candidate.url)) ??
        entry.images[0] ??
        null;
      if (image) usedImages.add(image.publicId || image.url);

      const destination = group.param && group.param !== "shopby"
        ? `/shop?${group.param}=${encodeURIComponent(entry.name)}`
        : `/shop?shopby=${encodeURIComponent(`${key}:${entry.name}`)}`;

      items.push({
        id: `${key}-${index}`,
        name: entry.name,
        image,
        destination,
        group: group.id || key,
        order: index,
        published: true,
      });
    });
  });

  if (!groups.length) return null;
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

/**
 * Admin taxonomy labels, grouped by dimension.
 * Public read is allowed (see firestore.rules) so Shop filters can show
 * admin allocations even before a published product uses them.
 * Returns { category: [], occasion: [], ... } with trimmed, deduped labels.
 */
export async function fetchTaxonomyLabels() {
  const empty = { category: [], occasion: [], style: [], fabric: [], colour: [], size: [] };
  if (!isFirebaseConfigured) return empty;
  try {
    const snapshot = await getDocs(query(collection(db, "taxonomy"), limit(500)));
    const grouped = { ...empty };
    snapshot.docs.forEach((entry) => {
      const data = entry.data() ?? {};
      const dimension = String(data.dimension ?? "").trim();
      const name = String(data.name ?? "").trim();
      if (!grouped[dimension] || !name) return;
      const exists = grouped[dimension].some((label) => label.toLowerCase() === name.toLowerCase());
      if (!exists) grouped[dimension].push(name);
    });
    Object.keys(grouped).forEach((key) => grouped[key].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
    return grouped;
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);
    return empty;
  }
}

/** Published review / feed entries, newest first after chronology is resolved. */
export async function fetchPublishedReviews(max = 20, strict = false) {
  if (!isFirebaseConfigured) { if (strict) throw new Error("Reviews are not connected."); return []; }

  try {
    // Sort client-side after fetching the published set so legacy documents that
    // predate publishedAt can safely fall back to createdAt/updatedAt without
    // requiring a brittle Firestore composite index. The public homepage is then
    // capped to the requested latest window (20 by default).
    const snapshot = await getDocs(
      query(collection(db, "reviews"), where("published", "==", true))
    );
    const reviews = snapshot.docs
      .map((entry) => normaliseReviewRecord(entry.id, entry.data() ?? {}))
      .filter(Boolean);
    return selectLatestPublishedReviews(reviews, max);
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);
    if (strict) throw new Error("Reviews could not be loaded.");
    return [];
  }
}
