import { Link } from "react-router-dom";
import ProductImage from "./ProductImage";
import StitchArrowIcon from "../common/icons/StitchArrowIcon";
import { useSavedPieces } from "../../context/SavedPiecesContext";
import { useToast } from "../../context/ToastContext";
import { formatNaira } from "../../utils/formatters";
import "./ProductCard.css";

// Wide "swatch" crop in the grid (matches --product-card-media-ratio in
// ProductCard.css — change the two together), square beside the text
// in the list view.
const GRID_IMAGE = "w_720,ar_3:1,c_fill,g_auto,q_auto,f_auto";
const LIST_IMAGE = "w_480,ar_1:1,c_fill,g_auto,q_auto,f_auto";

function HeartIcon({ filled }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20.8 8.8c0 5-8.8 10-8.8 10s-8.8-5-8.8-10A4.8 4.8 0 0 1 12 5.9a4.8 4.8 0 0 1 8.8 2.9Z" />
    </svg>
  );
}

/** "Deep Burgundy – Traditional Weave": colour, then weave, when the piece has them. */
function buildSubtitle(product) {
  const colour = (product.colour ?? []).slice(0, 2).join(", ");
  const fabric = product.fabric?.[0] ?? "";
  return [colour, fabric].filter(Boolean).join(" – ");
}

function ProductPrice({ product }) {
  const price = formatNaira(product.minPrice);
  const unit = product.unitLabel ? ` ${product.unitLabel}` : "";

  if (product.hasVariablePricing) {
    return (
      <p className="product-card__price">
        <span className="visually-hidden">Price from </span>
        <span className="product-card__from" aria-hidden="true">
          From{" "}
        </span>
        {price}
        {unit}
      </p>
    );
  }

  return (
    <p className="product-card__price">
      {price}
      {unit}
    </p>
  );
}

/**
 * Shop product card. One clear action — View Piece — because sizes and
 * other required choices are made on Product Details; the heart saves
 * the piece for later. `view` switches between the two-up grid card and
 * the horizontal list-row card.
 */
export default function ProductCard({ product, view = "grid", imageLoading = "lazy" }) {
  const { isSaved, toggleSaved, isPersistent } = useSavedPieces();
  const { showToast } = useToast();

  const saved = isSaved(product.id);
  const subtitle = buildSubtitle(product);

  const handleSave = () => {
    const nowSaved = toggleSaved(product.id);
    showToast(
      nowSaved
        ? isPersistent
          ? "Saved to your Saved Pieces."
          : "Saved for this visit. Create a Profile to keep your Saved Pieces."
        : "Removed from your Saved Pieces."
    );
  };

  return (
    <article className={`product-card${view === "list" ? " product-card--list" : ""}`}>
      <div className="product-card__media">
        <Link to={product.href} className="product-card__media-link" tabIndex={-1} aria-hidden="true">
          <ProductImage
            image={product.image}
            alt={product.name}
            transformation={view === "list" ? LIST_IMAGE : GRID_IMAGE}
            loading={imageLoading}
            sizes={
              view === "list"
                ? "(min-width: 640px) 220px, 40vw"
                : "(min-width: 1280px) 20vw, (min-width: 768px) 30vw, 45vw"
            }
          />
        </Link>

          <button
            type="button"
            className={`product-card__save${saved ? " is-saved" : ""}`}
            onClick={handleSave}
            aria-pressed={saved}
            aria-label={saved ? `Remove ${product.name} from Saved Pieces` : `Save ${product.name} to Saved Pieces`}
          >
            <HeartIcon filled={saved} />
          </button>
      </div>

      <div className="product-card__body">
        <h3 className="product-card__name">
          <Link to={product.href}>{product.name}</Link>
        </h3>
        {subtitle ? <p className="product-card__subtitle">{subtitle}</p> : null}
        <ProductPrice product={product} />
        <Link to={product.href} className="product-card__cta">
          <span>View Piece</span>
          <StitchArrowIcon size={16} className="product-card__cta-icon" />
          <span className="visually-hidden"> {product.name}</span>
        </Link>
      </div>
    </article>
  );
}
