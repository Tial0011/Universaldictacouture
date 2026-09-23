import { Link } from "react-router-dom";
import ProductImage from "../product/ProductImage";
import StitchArrowIcon from "../common/icons/StitchArrowIcon";
import { categoryIconFor } from "../product/icons/CategoryIcons";
import { useSavedPieces } from "../../context/SavedPiecesContext";
import { useToast } from "../../context/ToastContext";
import { formatNaira } from "../../utils/formatters";
import "./NewInCard.css";

function HeartIcon({ filled }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
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

/** A published piece using its own uploaded image. */
export default function NewInCard({ product, imageLoading = "lazy" }) {
  const { isSaved, toggleSaved, isPersistent } = useSavedPieces();
  const { showToast } = useToast();

  const saved = isSaved(product.id);
  const CategoryIcon = categoryIconFor(product.category);
  const categoryLabel = product.category.join(", ");
  const price = formatNaira(product.minPrice);
  const unit = product.unitLabel ? ` ${product.unitLabel}` : "";

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
    <article className="menu-card">
      <div className="menu-card__media">
        <Link to={product.href} className="menu-card__media-link" tabIndex={-1} aria-hidden="true">
          <ProductImage
            image={product.image}
            alt={product.image ? product.name : ""}
            transformation="w_720,h_720,c_limit,q_auto,f_auto"
            loading={imageLoading}
            sizes="(min-width: 1280px) 16vw, (min-width: 640px) 30vw, 45vw"
          />
        </Link>

          <button
            type="button"
            className={`menu-card__save${saved ? " is-saved" : ""}`}
            onClick={handleSave}
            aria-pressed={saved}
            aria-label={
              saved
                ? `Remove ${product.name} from Saved Pieces`
                : `Save ${product.name} to Saved Pieces`
            }
          >
            <HeartIcon filled={saved} />
          </button>
      </div>

      <div className="menu-card__body">
        <h3 className="menu-card__name">
          <Link to={product.href}>{product.name}</Link>
        </h3>

        <p className="menu-card__line">
          <span className="menu-card__price">
            {product.hasVariablePricing ? (
              <>
                <span className="visually-hidden">Price from </span>
                <span className="menu-card__from" aria-hidden="true">
                  From{" "}
                </span>
              </>
            ) : null}
            {price}
            {unit}
          </span>
          <span className="menu-card__leader" aria-hidden="true" />
          <span className="menu-card__mark" title={categoryLabel}>
            <CategoryIcon size={20} />
            <span className="visually-hidden">Category: {categoryLabel}</span>
          </span>
        </p>

        <Link to={product.href} className="menu-card__cta">
          <span>View Piece</span>
          <StitchArrowIcon size={16} className="menu-card__cta-icon" />
        </Link>
      </div>
    </article>
  );
}
