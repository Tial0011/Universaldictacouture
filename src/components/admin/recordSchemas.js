import { DIMENSIONS, HERO_CONCEPTS } from "../../services/adminModel";
const text = (key, label, extra = {}) => ({ key, label, ...extra });
const visibility = text("published", "Published on website", { type: "checkbox" });
export const SCHEMAS = {
  products: {
    title: "Products", singular: "product", description: "Manage your collection, from first draft to published piece.",
    initial: { name: "", price: "", status: "draft", category: "", images: [], isNewIn: false },
    fields: [
      text("name", "Product name", { required: true }), text("price", "Price (NGN)", { type: "number", hint: "Required before publishing. Enter the base price in naira." }),
      text("status", "Visibility", { type: "select", options: ["draft", "published", "archived"] }),
      text("unitLabel", "Price unit", { hint: "Optional, for example: per yard." }),
      ...DIMENSIONS.map(key => text(key, key === "category" ? "Categories" : key[0].toUpperCase() + key.slice(1), { type: "values", hint: "Separate multiple labels with commas." })),
      text("isNewIn", "Feature in New In", { type: "checkbox" }),
      text("keywords", "Search keywords", { type: "values" }), text("aliases", "Alternative names", { type: "values" }),
      text("images", "Product photos", { type: "images", hint: "The first photo is the cover. JPEG, PNG or WebP, up to 4 MB each." }),
    ],
  },
  taxonomy: {
    title: "Categories & attributes", singular: "label", description: "Allocate shop labels for your catalogue. Labels appear in Shop filters immediately (with zero count until a published product uses the exact spelling). Use these spellings when adding products.",
    initial: { name: "", dimension: "category" },
    fields: [text("name", "Label", { required: true }), text("dimension", "Type", { type: "select", options: DIMENSIONS })],
  },
  heroSlides: {
    title: "Homepage", singular: "slide", description: "Manage the main homepage banners. Lower display-order numbers appear first. The website displays up to 12 published slides.",
    initial: { headline: "Modern Tradition", secondary: "Modern You", eyebrow: "PREMIUM ASO OKE", body: "Beautifully crafted Aso Oke for every occasion. Classic, elegant and proudly Nigerian.", concept: "ready-to-wear", order: 0, published: false },
    fields: [
      text("concept", "Banner theme", { type: "select", options: HERO_CONCEPTS }),
      text("headline", "Headline", { required: true }), text("secondary", "Second headline line"), text("eyebrow", "Small heading"), text("body", "Supporting text", { type: "textarea" }),
      text("image", "Desktop photo", { type: "image" }), text("imageMobile", "Mobile photo (optional)", { type: "image" }),
      text("order", "Display order", { type: "number" }), visibility,
    ],
  },
  reviews: {
    title: "Customer reviews", singular: "review", description: "Add genuine customer feedback and choose which reviews appear on the website.",
    initial: { author: "", body: "", published: false },
    fields: [text("author", "Customer name", { required: true }), text("body", "Customer review", { required: true, type: "textarea" }), text("image", "Customer photo (optional)", { type: "image" }), visibility],
  },
  discoveryModules: {
    title: "Shop discovery", singular: "section", description: "Create image tiles that guide customers to an occasion or collection. Keep one active section per placement; lower display order takes priority.",
    initial: { title: "Shop by Occasion", placement: "home", active: false, order: 0, items: [], groups: [] },
    fields: [text("title", "Section title", { required: true }), text("placement", "Show on", { type: "select", options: ["home", "shop"] }), text("order", "Display order", { type: "number" }), text("items", "Discovery tiles", { type: "tiles" }), text("active", "Published on website", { type: "checkbox" })],
  },
};
