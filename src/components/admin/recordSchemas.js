import { DIMENSIONS, HERO_CONCEPTS } from "../../services/adminModel";
const text = (key, label, extra = {}) => ({ key, label, ...extra });
const visibility = text("published", "Published on website", { type: "checkbox" });
export const SCHEMAS = {
  products: {
    title: "Products", singular: "product", description: "Manage your collection, from first draft to published piece.",
    initial: { name: "", price: "", unitLabel: "", status: "draft", category: "", shopBy: {}, occasion: [], style: [], fabric: [], images: [], isNewIn: false },
    fields: [
      text("name", "Product name", { required: true, section: "basic" }),
      text("description", "Product description", { type: "textarea", section: "basic", hint: "Describe the fabric, finish and fit. Shown on the product page and included when customers share this piece (up to 4,000 characters)." }),
      text("price", "Main Price", { type: "number", section: "pricing", hint: "Required before publishing. Enter the single fixed main price in naira (NGN)." }),
      text("unitLabel", "Commercial unit", { section: "pricing", hint: "Shown beside the public price. Use the truthful unit for this product, for example per bundle, per set, complete, per keda or per yard." }),
      text("images", "Product photos", { type: "images", section: "images", hint: "The first photo is the cover. JPEG, PNG or WebP, up to 4 MB each." }),
      text("category", "Categories", { type: "values", section: "classification", hint: "Separate multiple labels with commas." }),
      text("shopBy", "Shop By", { type: "shopBy", section: "classification", hint: "Choose the reusable Shop By values that describe this product. Manage the available groups and choices from the Shop By admin page." }),
      text("colour", "Colour", { type: "values", section: "classification", hint: "Separate multiple labels with commas." }),
      text("isNewIn", "Feature in New In", { type: "checkbox", section: "merchandising", hint: "New In is curated manually and is separate from Newest First." }),
      text("keywords", "Search keywords", { type: "values", section: "merchandising", hint: "Use real search terms that help customers find this product." }),
      text("aliases", "Alternative names", { type: "values", section: "merchandising", hint: "Add genuine synonyms or alternate product names without changing the public product name." }),
      text("status", "Publication state", { type: "select", section: "publication", options: ["draft", "published", "unpublished", "archived"], hint: "Lifecycle changes use explicit protected actions. Unpublished is not Draft. Restore returns Archived products to Unpublished and never republishes them." }),
    ],
  },
  taxonomy: {
    title: "Categories & attributes", singular: "label", description: "Manage the catalogue labels used by Shop filters and product classification. Keep spellings consistent across products; Size is not part of Shop V1.",
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
    title: "Customer Reviews", singular: "review", description: "Moderate customer stories and control what appears publicly in Review & Feeds.",
    initial: {
      author: "",
      body: "",
      image: null,
      customerServiceRating: 0,
      productQualityRating: 0,
      productId: "",
      status: "pending",
      published: false,
    },
    fields: [
      text("author", "Customer / reviewer name", { required: true }),
      text("body", "Customer review", { required: true, type: "textarea" }),
      text("image", "Customer photo (optional)", { type: "image", hint: "Zero or one JPEG, PNG or WebP image." }),
      text("customerServiceRating", "Customer Service rating", { type: "rating", required: true }),
      text("productQualityRating", "Product Quality rating", { type: "rating", required: true }),
      text("productId", "Reviewed product", { type: "product", required: true }),
      text("status", "Status", { type: "select", options: ["pending", "published", "hidden"] }),
    ],
  },
  discoveryModules: {
    title: "Shop Space", singular: "section", description: "Create image tiles that guide customers to an occasion or collection. Keep one active section per placement; lower display order takes priority.",
    initial: { title: "Shop by Occasion", placement: "home", active: false, order: 0, items: [], groups: [] },
    fields: [text("title", "Section title", { required: true }), text("placement", "Show on", { type: "select", options: ["home", "shop"] }), text("order", "Display order", { type: "number" }), text("items", "Discovery tiles", { type: "tiles" }), text("active", "Published on website", { type: "checkbox" })],
  },
};
