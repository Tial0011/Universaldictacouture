import { Link } from "react-router-dom";
import ProductImage from "./ProductImage";
import StitchArrowIcon from "../common/icons/StitchArrowIcon";
import { useSavedPieces } from "../../context/SavedPiecesContext";
import { useToast } from "../../context/ToastContext";
import { formatNaira } from "../../utils/formatters";
import "./ProductCard.css";

const GRID_IMAGE = "w_720,h_720,c_limit,q_auto,f_auto";
const SHOP_GRID_IMAGE = "w_720,h_900,c_fill,g_auto,q_auto,f_auto";
const LIST_IMAGE = "w_480,h_480,c_limit,q_auto,f_auto";

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

function buildSubtitle(product) {
  const colour = (product.colour ?? []).slice(0, 2).join(", ");
  const fabric = product.fabric?.[0] ?? "";
  return [colour, fabric].filter(Boolean).join(" – ");
}

function ProductPrice({ product }) {
  const price = formatNaira(product.mainPrice ?? product.price ?? product.minPrice);
  const token = product.unitLabel;

  return (
    <div className="product-card__price-wrap">
      <p className="product-card__price">{price}</p>
      {token && <p className="product-card__price-token">{token}</p>}
    </div>
  );
}

/**
 * Shared product card. The Shop variant follows the Section 4 card
 * contract (image, heart, name, live price/unit, SHOP PIECE) while
 * other destinations keep their existing compact preview treatment.
 */
export default function ProductCard({
  product,
  view = "grid",
  variant = "default",
  navigationState,
  onNavigate,
  imageLoading = "lazy",
}) {
  const { isSaved, toggleSaved } = useSavedPieces();
  const { showToast } = useToast();

  const isShopCard = variant === "shop";
  const saved = isSaved(product.id);
  const subtitle = isShopCard ? "" : buildSubtitle(product);
  const ctaLabel = isShopCard ? "SHOP THIS PIECE \u2192" : "View Piece";
  const showCtaIcon = !isShopCard;
  const imageTransformation = view === "list"
    ? LIST_IMAGE
    : isShopCard
      ? SHOP_GRID_IMAGE
      : GRID_IMAGE;

  const handleSave = () => {
    const nowSaved = toggleSaved(product.id);
    showToast(nowSaved ? "Added to My Closet." : "Removed from My Closet.");
  };

  return (
    <article className={`product-card${view === "list" ? " product-card--list" : ""}${isShopCard ? " product-card--shop" : ""}`}>
      <div className="product-card__media">
        <Link
          to={product.href}
          state={navigationState}
          className="product-card__media-link"
          tabIndex={-1}
          aria-hidden="true"
          onClick={onNavigate}
        >
          <ProductImage
            image={product.image}
            alt={product.name}
            transformation={imageTransformation}
            loading={imageLoading}
            sizes={
              view === "list"
                ? "(min-width: 640px) 220px, 40vw"
                : isShopCard
                  ? "(min-width: 1500px) 16vw, (min-width: 1024px) 22vw, (min-width: 640px) 31vw, 48vw"
                  : "(min-width: 1280px) 20vw, (min-width: 768px) 30vw, 45vw"
            }
          />
        </Link>

        <button
          type="button"
          className={`product-card__save${saved ? " is-saved" : ""}`}
          onClick={handleSave}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${product.name} from My Closet` : `Add ${product.name} to My Closet`}
        >
          <HeartIcon filled={saved} />
        </button>
      </div>

      <div className="product-card__body">
        <h3 className="product-card__name">
          <Link to={product.href} state={navigationState} onClick={onNavigate}>{product.name}</Link>
        </h3>
        {subtitle ? <p className="product-card__subtitle">{subtitle}</p> : null}
        <ProductPrice product={product} />
        <Link to={product.href} state={navigationState} className="product-card__cta" onClick={onNavigate}>
          <span>{ctaLabel}</span>
          {showCtaIcon ? <StitchArrowIcon size={16} className="product-card__cta-icon" /> : null}
          <span className="visually-hidden"> {product.name}</span>
        </Link>
      </div>
    </article>
  );
}
