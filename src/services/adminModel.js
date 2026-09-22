export const DIMENSIONS = ["category", "occasion", "style", "fabric", "colour", "size"];
export const HERO_CONCEPTS = ["ready-to-wear", "aso-oke-fabric", "custom-style", "shop-by-occasion", "bridal-event-dressing"];
export function splitValues(value) {
  return [...new Set((Array.isArray(value) ? value : String(value || "").split(",")).map(v => String(v).trim()).filter(Boolean))];
}
export function localDestination(value) {
  return typeof value === "string" && /^\/(?!\/)/.test(value) && !/[\\\s]/.test(value);
}
export function imageValue(value) {
  if (typeof value === "string") return { url: value, alt: "" };
  return value || null;
}
export function prepareRecord(kind, raw) {
  const data = { ...raw };
  delete data.id;
  delete data.createdAt;
  delete data.updatedAt;
  const required = (key, label) => {
    data[key] = String(data[key] || "").trim();
    if (!data[key]) throw new Error(label + " is required.");
  };
  if (kind === "products") {
    required("name", "Product name");
    DIMENSIONS.forEach(key => { data[key] = splitValues(data[key]); });
    data.aliases = splitValues(data.aliases);
    data.keywords = splitValues(data.keywords);
    if (!["draft", "published", "archived"].includes(data.status)) throw new Error("Choose a product status.");
    if (data.price !== "" && data.price != null) {
      data.price = Number(data.price);
      if (!Number.isFinite(data.price) || data.price < 0) throw new Error("Enter a valid price of zero or more.");
    } else data.price = null;
    if (data.status === "published" && (data.price === null || !data.category.length)) {
      throw new Error("Add a price and at least one category before publishing.");
    }
    data.archived = data.status === "archived";
  }
  if (kind === "heroSlides") {
    required("headline", "Headline");
    if (!HERO_CONCEPTS.includes(data.concept)) throw new Error("Choose an approved slide concept.");
    data.order = Number(data.order || 0);
    if (!Number.isFinite(data.order) || data.order < 0) throw new Error("Display order must be zero or more.");
  }
  if (kind === "reviews") {
    required("author", "Customer name");
    required("body", "Review");
  }
  if (kind === "discoveryModules") {
    required("title", "Section title");
    if (!["home", "shop"].includes(data.placement)) throw new Error("Choose a placement.");
    data.order = Number(data.order || 0);
    if (!Number.isFinite(data.order) || data.order < 0) throw new Error("Display order must be zero or more.");
    data.items = (data.items || []).map((item, index) => {
      if (!String(item.name || "").trim() || !localDestination(item.destination)) {
        throw new Error("Each discovery tile needs a name and a local link, such as /shop?occasion=Bridal.");
      }
      return { ...item, name: item.name.trim(), id: item.id || "tile-" + index, order: index, published: item.published !== false };
    });
    if (data.active && !data.items.length) throw new Error("Add at least one tile before publishing.");
  }
  if (kind === "taxonomy") {
    required("name", "Label");
    if (!DIMENSIONS.includes(data.dimension)) throw new Error("Choose a category or attribute type.");
  }
  return data;
}
