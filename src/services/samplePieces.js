/**
 * Preview pieces for New In (Home) and the Shop grid.
 *
 * Until Firebase is connected and real pieces are published, both
 * sections have nothing to show — and an empty page feels
 * unfinished. These six stand-ins let the design be seen in full
 * (names, prices and weaves follow the Shop mockup). They are NOT
 * products: they share the same three duplicated placeholder
 * photographs (see collection-placeholder-*.jpg), can't be saved, and
 * can't be added to Closet — the card shows a "Preview" label instead
 * of those actions.
 *
 * They only ever appear when preview mode is on — automatically under
 * `npm run dev`, or in a deployed build when VITE_SHOW_SAMPLE_PIECES is
 * "true" — so a live storefront never shows invented pieces or prices.
 * Real published pieces always take over as soon as they exist.
 */
import { normaliseText } from "../utils/search";
import collectionPlaceholder1 from "../assets/images/collection/collection-placeholder-1.jpg";
import collectionPlaceholder2 from "../assets/images/collection/collection-placeholder-2.jpg";
import collectionPlaceholder3 from "../assets/images/collection/collection-placeholder-3.jpg";

const PLACEHOLDER_IMAGES = [collectionPlaceholder1, collectionPlaceholder2, collectionPlaceholder3];

export const SAMPLE_PIECES_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_SAMPLE_PIECES === "true";

const sample = (id, name, price, unitLabel, details) => {
  const { category, occasion, style, fabric, colour } = details;
  return {
    id: `sample-${id}`,
    slug: `sample-${id}`,
    name,
    href: "/shop",
    image: { url: PLACEHOLDER_IMAGES[(id - 1) % PLACEHOLDER_IMAGES.length], publicId: "", alt: "" },
    images: [],
    minPrice: price,
    maxPrice: price,
    hasVariablePricing: false,
    unitLabel,
    category: [category],
    occasion,
    style,
    fabric,
    colour,
    size: [],
    isNewIn: true,
    isSample: true,
    // Descending, so "Newest First" keeps the order listed below.
    publishedAt: new Date(Date.UTC(2025, 0, 31 - id)),
    searchText: normaliseText(
      [name, category, ...occasion, ...style, ...fabric, ...colour].join(" ")
    ),
  };
};

export const SAMPLE_PIECES = [
  sample(1, "Royal Burgundy Aso Oke Fabric", 95000, "per bundle", {
    category: "Aso Oke Fabric",
    occasion: ["Wedding Guest", "Traditional Engagement"],
    style: ["Traditional"],
    fabric: ["Traditional Weave"],
    colour: ["Deep Burgundy"],
  }),
  sample(2, "Champagne Elegance Aso Oke", 120000, "per set", {
    category: "Aso Oke Set",
    occasion: ["Wedding Guest", "Bridal"],
    style: ["Classic"],
    fabric: ["Fine Weave"],
    colour: ["Champagne Gold"],
  }),
  sample(3, "Blush Heritage Aso Oke Fabric", 95000, "per bundle", {
    category: "Aso Oke Fabric",
    occasion: ["Celebration", "Wedding Guest"],
    style: ["Classic"],
    fabric: ["Classic Weave"],
    colour: ["Blush Pink"],
  }),
  sample(4, "Emerald Grace Aso Oke Fabric", 130000, "per set", {
    category: "Aso Oke Set",
    occasion: ["Celebration"],
    style: ["Contemporary"],
    fabric: ["Premium Weave"],
    colour: ["Emerald Green"],
  }),
  sample(5, "Indigo Heritage Weave", 110000, "per bundle", {
    category: "Aso Oke Fabric",
    occasion: ["Church/Event", "Traditional Engagement"],
    style: ["Traditional"],
    fabric: ["Signature Weave"],
    colour: ["Indigo"],
  }),
  sample(6, "Ivory Royal Aso Oke Fabric", 100000, "per bundle", {
    category: "Aso Oke Fabric",
    occasion: ["Bridal", "Church/Event"],
    style: ["Classic"],
    fabric: ["Classic Weave"],
    colour: ["Ivory"],
  }),
];
