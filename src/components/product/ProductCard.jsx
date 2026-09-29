import { useEffect, useRef, useState } from "react";
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

const GRID_IMAGE_SOURCES = [
  { width: 320, transformation: "w_320,h_320,c_limit,q_auto,f_auto" },
  { width: 480, transformation: "w_480,h_480,c_limit,q_auto,f_auto" },
  { width: 720, transformation: GRID_IMAGE },
];

const SHOP_IMAGE_SOURCES = [
  { width: 320, transformation: "w_320,h_400,c_fill,g_auto,q_auto,f_auto" },
  { width: 480, transformation: "w_480,h_600,c_fill,g_auto,q_auto,f_auto" },
  { width: 640, transformation: "w_640,h_800,c_fill,g_auto,q_auto,f_auto" },
  { width: 720, transformation: SHOP_GRID_IMAGE },
];

const LIST_IMAGE_SOURCES = [
  { width: 240, transformation: "w_240,h_240,c_limit,q_auto,f_auto" },
  { width: 360, transformation: "w_360,h_360,c_limit,q_auto,f_auto" },
  { width: 480, transformation: LIST_IMAGE },
];

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
  const useFromPrice = product.hasVariablePricing === true
    && Number.isFinite(product.minPrice)
    && Number.isFinite(product.maxPrice)
    && product.minPrice < product.maxPrice;
  const amount = useFromPrice
    ? product.minPrice
    : product.mainPrice ?? product.price ?? product.minPrice;
  const price = formatNaira(amount);
  const token = typeof (product.unitLabel || product.priceToken) === "string"
    ? (product.unitLabel || product.priceToken).trim()
    : "";

  return (
    <div className="product-card__price-wrap">
      <p className="product-card__price">
        {useFromPrice ? <span className="product-card__price-prefix">From </span> : null}
        {price || "Price unavailable"}
      </p>
      {token && <p className="product-card__price-token">{token}</p>}
    </div>
  );
}

function isPlainNavigation(event) {
  return event.button === 0
    && !event.metaKey
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey;
}

/**
 * Shared product card. The Shop variant follows the Section 4 card
 * contract (image, heart, name, live price/unit, SHOP THIS PIECE) while
 * other destinations keep their existing compact preview treatment.
 */
export default function ProductCard({
  product,
  view = "grid",
  variant = "default",
  navigationState,
  onNavigate,
  imageLoading = "lazy",
  imageFetchPriority = "auto",
}) {
  const { isSaved, toggleSavedConfirmed } = useSavedPieces();
  const { showToast } = useToast();
  const [savePending, setSavePending] = useState(false);
  const [navigationPending, setNavigationPending] = useState(false);
  const navigationLockRef = useRef(false);
  const navigationTimerRef = useRef(null);

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
  const imageSources = view === "list"
    ? LIST_IMAGE_SOURCES
    : isShopCard
      ? SHOP_IMAGE_SOURCES
      : GRID_IMAGE_SOURCES;
  const imageWidth = isShopCard ? 720 : view === "list" ? 480 : 720;
  const imageHeight = isShopCard ? 900 : view === "list" ? 480 : 720;

  useEffect(() => () => {
    if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
  }, []);

  const handleNavigate = (event) => {
    if (!isPlainNavigation(event)) return;
    if (navigationLockRef.current) {
      event.preventDefault();
      return;
    }
    navigationLockRef.current = true;
    setNavigationPending(true);
    navigationTimerRef.current = setTimeout(() => {
      navigationLockRef.current = false;
      setNavigationPending(false);
    }, 1200);
    onNavigate?.(product, event);
  };

  const handleSave = async () => {
    if (savePending) return;
    setSavePending(true);
    try {
      const result = await toggleSavedConfirmed(product.id);
      if (!result?.ok) {
        showToast("We couldn't update My Closet. Please try again.", "error");
        return;
      }
      if (result.storage === "memory") {
        showToast(
          result.added
            ? "Added to My Closet for this visit. Browser storage is unavailable."
            : "Removed from My Closet for this visit.",
          "error"
        );
        return;
      }
      showToast(result.added ? "Added to My Closet." : "Removed from My Closet.");
    } catch {
      showToast("We couldn't update My Closet. Please try again.", "error");
    } finally {
      setSavePending(false);
    }
  };

  const navigationClass = navigationPending ? " is-navigation-pending" : "";
  const resolvedNavigationState = isShopCard && navigationState
    ? { ...navigationState, shopAnchorProductId: product.id }
    : navigationState;

  return (
    <article className={`product-card${view === "list" ? " product-card--list" : ""}${isShopCard ? " product-card--shop" : ""}`}>
      <div className="product-card__media">
        <Link
          to={product.href}
          state={resolvedNavigationState}
          className={`product-card__media-link${navigationClass}`}
          aria-label={`View ${product.name} details`}
          aria-disabled={navigationPending || undefined}
          onClick={handleNavigate}
        >
          <ProductImage
            image={product.image}
            alt={product.name}
            transformation={imageTransformation}
            srcSetSources={imageSources}
            loading={imageLoading}
            fetchPriority={imageFetchPriority}
            width={imageWidth}
            height={imageHeight}
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
          className={`product-card__save${saved ? " is-saved" : ""}${savePending ? " is-pending" : ""}`}
          onClick={handleSave}
          aria-pressed={saved}
          aria-busy={savePending || undefined}
          aria-label={saved ? `Remove ${product.name} from My Closet` : `Add ${product.name} to My Closet`}
          disabled={savePending}
        >
          <HeartIcon filled={saved} />
        </button>
      </div>

      <div className="product-card__body">
        <h3 className="product-card__name">
          <Link
            to={product.href}
            state={resolvedNavigationState}
            aria-disabled={navigationPending || undefined}
            className={navigationClass.trim() || undefined}
            onClick={handleNavigate}
          >
            {product.name}
          </Link>
        </h3>
        {subtitle ? <p className="product-card__subtitle">{subtitle}</p> : null}
        <ProductPrice product={product} />
        <Link
          to={product.href}
          state={resolvedNavigationState}
          className={`product-card__cta${navigationClass}`}
          aria-disabled={navigationPending || undefined}
          onClick={handleNavigate}
        >
          <span>{ctaLabel}</span>
          {showCtaIcon ? <StitchArrowIcon size={16} className="product-card__cta-icon" /> : null}
          <span className="visually-hidden"> {product.name}</span>
        </Link>
      </div>
    </article>
  );
}
