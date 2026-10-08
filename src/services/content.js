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
import { db } from "../firebase/firestore.js";
import { isFirebaseConfigured } from "../firebase/config.js";
import heroReadyToWear from "../assets/images/hero/hero-ready-to-wear.jpg";
import { DEFAULT_SHOP_BY_GROUPS, shopByDestination } from "./shopBy.js";
import { normaliseReviewRecord, selectLatestPublishedReviews, sortPublishedReviews } from "./reviewModel.js";
import { accountRequest } from "./accountApi";




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
  secondaryCta: { label: "Explore All Styles", to: "/shop?discovery=style" },
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
 * be added without changing this builder. Empty groups stay in Admin configuration
 * but do not render as dead public discovery tabs.
 */
export const SHOP_DISCOVERY_GROUPS = DEFAULT_SHOP_BY_GROUPS;

const SHOP_DISCOVERY_MAX_PER_GROUP = 10;

export function buildShopDiscovery(products, title = "Shop By", groupDefinitions = SHOP_DISCOVERY_GROUPS) {
  const groups = [];
  const items = [];
  const definitions = Array.isArray(groupDefinitions) ? groupDefinitions : SHOP_DISCOVERY_GROUPS;

  definitions.forEach((group) => {
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

    // The Shop discovery surface only renders catalogue-backed groups.
    // An admin-configured group with no published products is valid config,
    // but it should not become an empty public tab.
    if (!found.size) return;

    groups.push({ id: group.id || key, label: group.label || key, order: groups.length });

    const ordered = [...found.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const usedImages = new Set();
    ordered.slice(0, SHOP_DISCOVERY_MAX_PER_GROUP).forEach((entry, index) => {
      // Look for a designated Face product for this choice (e.g. Face of Occasion Alex)
      const faceProductId =
        group.faces?.[entry.name.toLowerCase()] ||
        group.faces?.[entry.name];
      let image = null;
      if (faceProductId) {
        const faceProduct = products.find(
          (candidate) => candidate.id === faceProductId || candidate.slug === faceProductId
        );
        if (faceProduct?.image) {
          image = faceProduct.image;
        }
      }
      if (!image) {
        image =
          entry.images.find((candidate) => !usedImages.has(candidate.publicId || candidate.url)) ??
          entry.images[0] ??
          null;
      }
      if (image) usedImages.add(image.publicId || image.url);

      items.push({
        id: `${key}-${index}`,
        name: entry.name,
        image,
        destination: shopByDestination(group, entry.name),
        group: group.id || key,
        order: index,
        published: true,
      });
    });
  });

  if (!groups.length || !items.length) return null;
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
  const empty = { category: [], occasion: [], style: [], fabric: [], colour: [] };
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

/** Published review / feed entries, newest first by first publication time. */
export async function fetchPublishedReviews(max = 20, strict = false) {
  if (!isFirebaseConfigured) { if (strict) throw new Error("Reviews are not connected."); return []; }

  try {
    // The homepage rule is intentionally based on publishedAt, not updatedAt:
    // editing an older story must never make it "new" again. We sort the entire
    // published set before applying the homepage cap. A null max returns the
    // complete published feed for /reviews-feeds.
    const response = await accountRequest("review-feed", {}, { publicRequest: true });
    const reviews = response.records
      .map((entry) => normaliseReviewRecord(entry.id, entry))
      .filter(Boolean);
    return max == null ? sortPublishedReviews(reviews) : selectLatestPublishedReviews(reviews, max);
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);
    if (strict) throw new Error("Reviews could not be loaded.");
    return [];
  }
}
