export const DIMENSIONS = ["category", "occasion", "style", "fabric", "colour"];
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

export function hasUsableImage(value) {
  if (!value) return false;
  if (typeof value === "string") return Boolean(value.trim());
  if (typeof value !== "object" || Array.isArray(value)) return false;
  return Boolean(String(value.url || value.secureUrl || value.secure_url || value.publicId || value.public_id || "").trim());
}

export function productAdminHref(raw = {}) {
  const identity = String(raw.slug || raw.id || "").trim();
  return identity ? `/shop/${encodeURIComponent(identity)}` : "";
}

export function productReadiness(raw = {}, { allowGeneratedIdentity = false } = {}) {
  const name = String(raw.name || "").trim();
  const price = raw.price === "" || raw.price == null ? null : Number(raw.price);
  const categories = splitValues(raw.category ?? raw.categories);
  const imageSource = Array.isArray(raw.images) ? raw.images : raw.images ? [raw.images] : [];
  const hasImage = hasUsableImage(raw.primaryImage) || imageSource.some(hasUsableImage);
  const hasIdentity = Boolean(String(raw.slug || raw.id || "").trim()) || allowGeneratedIdentity;
  const blockers = [];
  if (!name) blockers.push({ key: "name", label: "Product name" });
  if (!Number.isFinite(price) || price < 0) blockers.push({ key: "price", label: "Valid NGN price" });
  if (!hasImage) blockers.push({ key: "image", label: "Primary product image" });
  if (!categories.length) blockers.push({ key: "category", label: "At least one category" });
  if (!hasIdentity) blockers.push({ key: "identity", label: "Stable product identity" });

  const warnings = [];
  const unit = String(raw.unitLabel ?? raw.priceToken ?? "").trim();
  if (!unit) warnings.push({ key: "unit", label: "Commercial unit is not set" });

  const lifecycle = String(raw.status || "draft").trim().toLowerCase();
  let state = "draft";
  let label = "Draft";
  if (lifecycle === "archived") {
    state = "archived";
    label = "Archived";
  } else if (blockers.length) {
    state = "needs-attention";
    label = "Needs attention";
  } else if (lifecycle === "published") {
    state = "published";
    label = "Published";
  } else {
    state = "ready";
    label = "Ready to publish";
  }

  return {
    state,
    label,
    blockers,
    warnings,
    ready: blockers.length === 0,
    checks: [
      { key: "name", label: "Name", complete: Boolean(name) },
      { key: "price", label: "Valid price", complete: Number.isFinite(price) && price >= 0 },
      { key: "image", label: "Primary image", complete: hasImage },
      { key: "identity", label: "Stable product identity", complete: hasIdentity },
      { key: "category", label: "Required taxonomy", complete: categories.length > 0 },
    ],
  };
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
    data.description = typeof data.description === "string" ? data.description.trim() : "";
    if (data.description.length > 4000) throw new Error("Keep the product description within 4,000 characters.");
    DIMENSIONS.forEach(key => { data[key] = splitValues(data[key]); });
    const rawShopBy = data.shopBy && typeof data.shopBy === "object" && !Array.isArray(data.shopBy) ? data.shopBy : {};
    data.shopBy = Object.fromEntries(
      Object.entries(rawShopBy)
        .map(([key, values]) => [String(key).trim(), splitValues(values)])
        .filter(([key, values]) => key && values.length)
    );
    ["occasion", "style", "fabric"].forEach((key) => {
      const selected = data.shopBy[key]?.length ? data.shopBy[key] : data[key];
      data[key] = splitValues(selected);
      if (data[key].length) data.shopBy[key] = data[key];
      else delete data.shopBy[key];
    });
    data.aliases = splitValues(data.aliases);
    data.keywords = splitValues(data.keywords);
    if (!["draft", "published", "archived"].includes(data.status)) throw new Error("Choose a product status.");
    if (data.price !== "" && data.price != null) {
      data.price = Number(data.price);
      if (!Number.isFinite(data.price) || data.price < 0) throw new Error("Enter a valid price of zero or more.");
    } else data.price = null;
    data.mainPrice = data.price;
    const token = typeof (data.unitLabel ?? data.priceToken) === "string"
      ? (data.unitLabel ?? data.priceToken).trim()
      : "";
    if (token.length > 120) throw new Error("Keep the commercial unit within 120 characters.");
    data.unitLabel = token;
    data.priceToken = token;
    if (Array.isArray(data.variants) && data.variants.length > 0) {
      const variantPrices = data.variants
        .map((v) => Number(v.price))
        .filter((p) => Number.isFinite(p) && p >= 0);
      if (variantPrices.length > 0 && data.price !== null) {
        data.price = Math.max(data.price, ...variantPrices);
        data.mainPrice = data.price;
      }
      data.variants = data.variants.map((v) => ({ ...v, price: data.price }));
    }
    if (data.status === "published") {
      if (data.price === null || !data.category.length) {
        throw new Error("Add a price and at least one category before publishing.");
      }
      const productImages = Array.isArray(data.images) ? data.images.filter(hasUsableImage) : [];
      if (!hasUsableImage(data.primaryImage) && productImages.length === 0) {
        throw new Error("Add at least one valid product photo before publishing.");
      }
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

    const sourceImages = Array.isArray(data.images)
      ? data.images
      : data.image
        ? [data.image]
        : [];
    if (sourceImages.length > 1) throw new Error("Use zero or one customer review photo.");
    data.image = sourceImages.map(imageValue).filter(Boolean)[0] || null;
    delete data.images;

    const normaliseRating = (value, label) => {
      const rating = Number(value);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        throw new Error(label + " must be between 1 and 5 stars.");
      }
      return rating;
    };
    data.customerServiceRating = normaliseRating(data.customerServiceRating, "Customer Service rating");
    data.productQualityRating = normaliseRating(data.productQualityRating, "Product Quality rating");
    data.productId = String(data.productId || "").trim();
    if (!data.productId) throw new Error("Choose the product this review is about.");

    data.status = String(data.status || (data.published ? "published" : "pending")).trim().toLowerCase();
    if (!["pending", "published", "hidden"].includes(data.status)) throw new Error("Choose a valid review status.");
    data.published = data.status === "published";

    data.customerId = String(data.customerId || "").trim();
    data.orderId = String(data.orderId || "").trim();
    data.orderItemId = String(data.orderItemId || "").trim();

    if (data.productSnapshot && typeof data.productSnapshot === "object") {
      const price = Number(data.productSnapshot.price);
      data.productSnapshot = {
        name: String(data.productSnapshot.name || "").trim(),
        image: imageValue(data.productSnapshot.image),
        price: Number.isFinite(price) && price >= 0 ? price : null,
        slug: String(data.productSnapshot.slug || "").trim(),
      };
    } else {
      data.productSnapshot = null;
    }
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
