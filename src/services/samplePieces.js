/**
 * Preview pieces for New In (Home) and the Shop grid.
 *
 * Until Firebase is connected and real pieces are published, both
 * sections have nothing to show — and an empty page feels
 * unfinished. These six stand-ins let the design be seen in full
 * (names, prices and weaves follow the Shop mockup). They are NOT
 * products: they use fabric photographs cut from the Shop mockup (see
 * assets/images/samples), can't be saved, and can't be added to Closet.
 * Their View Piece button just returns to the Shop.
 *
 * They only ever appear when preview mode is on — automatically under
 * `npm run dev`, or in a deployed build when VITE_SHOW_SAMPLE_PIECES is
 * "true" — so a live storefront never shows invented pieces or prices.
 * Real published pieces always take over as soon as they exist.
 */
import { normaliseText } from "../utils/search";
import piece1 from "../assets/images/samples/piece-1.jpg";
import piece2 from "../assets/images/samples/piece-2.jpg";
import piece3 from "../assets/images/samples/piece-3.jpg";
import piece4 from "../assets/images/samples/piece-4.jpg";
import piece5 from "../assets/images/samples/piece-5.jpg";
import piece6 from "../assets/images/samples/piece-6.jpg";

// One fabric photograph per piece, in the order of SAMPLE_PIECES below
// (cut from the Shop mockup — low resolution, stand-ins only).
const SAMPLE_PHOTOS = [piece1, piece2, piece3, piece4, piece5, piece6];

export const SAMPLE_PIECES_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_SAMPLE_PIECES === "true";

const sample = (id, name, price, unitLabel, details) => {
  const { category, occasion, style, fabric, colour } = details;
  return {
    id: `sample-${id}`,
    slug: `sample-${id}`,
    name,
    href: "/shop",
    image: { url: SAMPLE_PHOTOS[id - 1], publicId: "", alt: "" },
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
