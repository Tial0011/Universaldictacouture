/**
 * Preview pieces for New In (Home) and the Shop grid.
 *
 * Until Firebase is connected and real pieces are published, both
 * sections have nothing to show — and an empty page feels
 * unfinished. These six stand-ins let the design be seen in full. They
 * are NOT products: they share the same three duplicated placeholder
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

const sample = (id, name, price, category) => ({
  id: `sample-${id}`,
  slug: `sample-${id}`,
  name,
  href: "/shop",
  image: { url: PLACEHOLDER_IMAGES[(id - 1) % PLACEHOLDER_IMAGES.length], publicId: "", alt: "" },
  images: [],
  minPrice: price,
  maxPrice: price,
  hasVariablePricing: false,
  unitLabel: "",
  category: [category],
  isNewIn: true,
  isSample: true,
  searchText: normaliseText(`${name} ${category}`),
});

export const SAMPLE_PIECES = [
  sample(1, "Champagne Aso Oke Set", 120000, "Aso Oke Set"),
  sample(2, "Lavender Dream Aso Oke Set", 115000, "Aso Oke Set"),
  sample(3, "Emerald Grace Aso Oke Set", 130000, "Aso Oke Set"),
  sample(4, "Blush Petal Aso Oke Set", 118000, "Aso Oke Set"),
  sample(5, "Bridal Ivory Aso Oke", 145000, "Aso Oke"),
  sample(6, "Wine Heritage Aso Oke", 145000, "Aso Oke"),
];
