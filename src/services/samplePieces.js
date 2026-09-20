/**
 * Preview pieces for the homepage New In section.
 *
 * Until Firebase is connected and real pieces are published, New In
 * has nothing to show — and an empty section makes the page feel
 * unfinished. These six stand-ins let the design be seen in full. They
 * are NOT products: they have no photo of their own (the cards borrow
 * the hero photograph), "View Piece" leads to the Shop, and they can't
 * be saved.
 *
 * They only ever appear when preview mode is on — automatically under
 * `npm run dev`, or in a deployed build when VITE_SHOW_SAMPLE_PIECES is
 * "true" — so a live storefront never shows invented pieces or prices.
 * Real published pieces always take over as soon as they exist.
 */
export const SAMPLE_PIECES_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_SAMPLE_PIECES === "true";

const sample = (id, name, price, category) => ({
  id: `sample-${id}`,
  slug: `sample-${id}`,
  name,
  href: "/shop",
  image: null,
  images: [],
  minPrice: price,
  maxPrice: price,
  hasVariablePricing: false,
  unitLabel: "",
  category: [category],
  isNewIn: true,
  isSample: true,
});

export const SAMPLE_PIECES = [
  sample(1, "Champagne Aso Oke Set", 120000, "Aso Oke Set"),
  sample(2, "Lavender Dream Aso Oke Set", 115000, "Aso Oke Set"),
  sample(3, "Emerald Grace Aso Oke Set", 130000, "Aso Oke Set"),
  sample(4, "Blush Petal Aso Oke Set", 118000, "Aso Oke Set"),
  sample(5, "Bridal Ivory Aso Oke", 145000, "Aso Oke"),
  sample(6, "Wine Heritage Aso Oke", 145000, "Aso Oke"),
];
