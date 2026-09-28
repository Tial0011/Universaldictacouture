import { useState, useRef } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useCatalogue } from "../../hooks/useCatalogue";
import { useSavedPieces } from "../../context/SavedPiecesContext";
import { useAuth } from "../../context/AuthContext";
import { useAuthGate } from "../../context/AuthGateContext";
import ProductImage from "../../components/product/ProductImage";
import Button from "../../components/common/Button";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import { formatNaira } from "../../utils/formatters";
import { productChatContext } from "../../services/chatModel";
import { buildProductShare, shareContent } from "../../services/shareContent";
import "./ProductDetails.css";

// Icons as lightweight inline SVG components
function ChevronIcon({ direction = "left" }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {direction === "left"
        ? <path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        : <path d="M7 4L13 10L7 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      }
    </svg>
  );
}

function HeartIcon({ filled }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function BankIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="22" x2="21" y2="22" />
      <line x1="6" y1="18" x2="6" y2="11" />
      <line x1="10" y1="18" x2="10" y2="11" />
      <line x1="14" y1="18" x2="14" y2="11" />
      <line x1="18" y1="18" x2="18" y2="11" />
      <polygon points="12 2 20 7 4 7" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

export default function ProductDetails() {
  const { productId } = useParams();
  const location = useLocation();
  const requestedReturn = location.state?.shopReturn;
  const backToShop = typeof requestedReturn === "string" && (requestedReturn === "/shop" || requestedReturn.startsWith("/shop?"))
    ? requestedReturn
    : "/shop";
  const backState = location.state?.shopVisibleCount
    ? { restoreVisibleCount: location.state.shopVisibleCount }
    : undefined;
  const { products, isLoading, error, retry } = useCatalogue();
  const product = products.find((item) => item.slug === productId || item.id === productId);

  useDocumentMeta({
    title: product ? `${product.name} | Universal Dicta Couture` : "Piece details | Universal Dicta Couture",
    description: product
      ? `${product.name} from Universal Dicta Couture. View the piece, available options and current pricing.`
      : undefined,
    canonicalPath: `/shop/${encodeURIComponent(product?.slug || product?.id || productId)}`,
    noindex: !isLoading && !product,
  });

  if (isLoading) {
    return (
      <section className="section product-details" aria-busy="true">
        <div className="container product-details__state" role="status">
          <p className="product-details__eyebrow">Universal Dicta Couture</p>
          <h1>Loading your piece</h1>
          <p>Gathering the images and details.</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="section product-details">
        <div className="container product-details__state">
          <h1>Unable to load this piece</h1>
          <p role="alert">The collection could not be loaded. Please try again.</p>
          <div className="product-details__state-actions">
            <Button onClick={retry}>Try again</Button>
            <Button to={backToShop} state={backState} variant="ghost">Back to shop</Button>
          </div>
        </div>
      </section>
    );
  }

  if (!product) {
    return (
      <section className="section product-details">
        <div className="container product-details__state">
          <p className="product-details__eyebrow">The collection</p>
          <h1>Piece unavailable</h1>
          <p>This piece is no longer available. Explore the current collection to find your next piece.</p>
          <Button to={backToShop} state={backState}>Back to shop</Button>
        </div>
      </section>
    );
  }

  return <Piece key={product.id} product={product} backToShop={backToShop} backState={backState} />;
}

function Piece({ product, backToShop, backState }) {
  const { user } = useAuth();
  const { requestAuth } = useAuthGate();
  const location = useLocation();
  const { isSaved, toggleSaved, error: savedError } = useSavedPieces();
  const images = [product.image, ...product.images].filter((image, index, entries) =>
    image && entries.findIndex(entry => entry && (entry.publicId || entry.url) === (image.publicId || image.url)) === index
  );
  const [imageIndex, setImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [orderDetail, setOrderDetail] = useState("");
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const saved = isSaved(product.id);
  const mainPrice = product.mainPrice ?? product.price ?? 0;
  const estimatedTotal = mainPrice * quantity;
  const unitLabel = product.unitLabel || product.priceToken || "";
  const colours = product.colour ?? [];
  const primaryColour = colours[0] || "";
  const detailRef = useRef(null);

  function handleSave() {
    setActionError("");
    try {
      toggleSaved(product.id);
    } catch {
      setActionError("We couldn't update My Pieces. Please try again.");
    }
  }

  async function handleShare() {
    if (!user) {
      requestAuth({ returnTo: `${location.pathname}${location.search}` });
      return;
    }
    const result = await shareContent(buildProductShare(product, window.location.origin));
    if (result === "copied") setMessage("Product name, description and link copied, ready to share.");
  }

  function adjustQuantity(delta) {
    setQuantity((q) => Math.max(1, q + delta));
    setMessage("");
  }

  const breadcrumbs = [
    { label: "Home", to: "/" },
    { label: "Shop", to: backToShop },
    ...(product.category?.[0] ? [{ label: product.category[0], to: `${backToShop}?category=${encodeURIComponent(product.category[0])}` }] : []),
    { label: product.name },
  ];

  return (
    <section className="section product-details" aria-labelledby="piece-title">
      <div className="container">
        {/* Breadcrumb */}
        <nav className="product-details__breadcrumb" aria-label="Breadcrumb">
          <ol>
            {breadcrumbs.map((crumb, index) => (
              <li key={index}>
                {crumb.to
                  ? <Link to={crumb.to}>{crumb.label}</Link>
                  : <span aria-current="page">{crumb.label}</span>
                }
              </li>
            ))}
          </ol>
        </nav>

        <div className="product-details__layout">
          {/* Gallery column */}
          <div className="product-details__gallery">
            <div className="product-details__media">
              {images.length > 1 && (
                <button
                  type="button"
                  className="product-details__media-nav product-details__media-nav--prev"
                  aria-label="Previous photograph"
                  onClick={() => setImageIndex((i) => (i - 1 + images.length) % images.length)}
                >
                  <ChevronIcon direction="left" />
                </button>
              )}
              <ProductImage image={images[imageIndex]} alt={product.name} loading="eager" />
              {images.length > 1 && (
                <button
                  type="button"
                  className="product-details__media-nav product-details__media-nav--next"
                  aria-label="Next photograph"
                  onClick={() => setImageIndex((i) => (i + 1) % images.length)}
                >
                  <ChevronIcon direction="right" />
                </button>
              )}
            </div>
            {images.length > 1 && (
              <div className="product-details__thumbnails" role="group" aria-label="Product photographs">
                {images.map((image, index) => (
                  <button
                    type="button"
                    key={image.publicId || image.url}
                    aria-label={`View photograph ${index + 1} of ${product.name}`}
                    aria-pressed={imageIndex === index}
                    onClick={() => setImageIndex(index)}
                  >
                    <ProductImage image={image} alt="" transformation="w_160,h_160,c_limit,q_auto,f_auto" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Information column */}
          <div className="product-details__information">
            {/* Heading block */}
            <div className="product-details__heading">
              <div className="product-details__heading-row">
                <h1 id="piece-title">{product.name}</h1>
                <button
                  type="button"
                  className={`product-details__save-btn${saved ? " is-saved" : ""}`}
                  onClick={handleSave}
                  aria-pressed={saved}
                  aria-label={saved ? `Remove ${product.name} from My Pieces` : `Save ${product.name} to My Pieces`}
                >
                  <HeartIcon filled={saved} />
                </button>
              </div>

              <div className="product-details__price-block" aria-live="polite" aria-atomic="true">
                <p className="product-details__price">{formatNaira(mainPrice)}</p>
                {unitLabel && (
                  <p className="product-details__price-token">{unitLabel}</p>
                )}
              </div>
            </div>

            {/* Description */}
            {product.description && (
              <p className="product-details__description">{product.description}</p>
            )}

            {/* Inspiration disclaimer */}
            <p className="product-details__disclaimer">
              <InfoIcon />
              <em>Outfit shown for inspiration only. This product is fabric only.</em>
            </p>

            {/* Current Colour */}
            {primaryColour && (
              <div className="product-details__colour-row">
                <span className="product-details__colour-label">Current Colour:</span>
                <span className="product-details__colour-swatch" aria-label={`Colour: ${primaryColour}`} />
                <span className="product-details__colour-name">{primaryColour}</span>
              </div>
            )}
            {colours.length > 0 && (
              <p className="product-details__colour-note">
                We can make any preferred order in your own color and style.
              </p>
            )}

            {/* Quantity block */}
            <div className="product-details__quantity-block">
              <h2 className="product-details__quantity-title">Quantity of Fabric in Bundles</h2>
              <div className="product-details__quantity-row">
                <button
                  type="button"
                  className="product-details__qty-btn"
                  aria-label="Decrease quantity"
                  onClick={() => adjustQuantity(-1)}
                  disabled={quantity <= 1}
                >
                  −
                </button>
                <span className="product-details__qty-value" aria-live="polite">{quantity}</span>
                <button
                  type="button"
                  className="product-details__qty-btn"
                  aria-label="Increase quantity"
                  onClick={() => adjustQuantity(1)}
                >
                  +
                </button>
              </div>

              {/* Bundle price calculator */}
              <div className="product-details__price-calc">
                <div className="product-details__price-unit">
                  <span className="product-details__price-unit-label">1{unitLabel ? ` ${unitLabel}` : " bundle"} =</span>
                  <span className="product-details__price-unit-value">{formatNaira(mainPrice)}</span>
                </div>
                {quantity > 1 && (
                  <div className="product-details__price-total">
                    <span className="product-details__price-total-label">
                      Estimated total for<br />{quantity} bundle{quantity !== 1 ? "s" : ""}:
                    </span>
                    <span className="product-details__price-total-value">{formatNaira(estimatedTotal)}</span>
                  </div>
                )}
              </div>

              <div className="product-details__calc-note">
                <InfoIcon />
                <span>The amount of fabric required depends on your preferred style. Chat with a Couturier for free to know how many bundles may be suitable for your order.</span>
              </div>
            </div>

            {/* Add More Detail */}
            <div className="product-details__detail-block">
              <label className="product-details__detail-label" htmlFor="order-detail">
                Add More Detail
              </label>
              <textarea
                id="order-detail"
                ref={detailRef}
                className="product-details__detail-textarea"
                placeholder="Specialize your order or add more detail..."
                value={orderDetail}
                onChange={(e) => setOrderDetail(e.target.value)}
                rows={3}
                maxLength={2000}
              />
            </div>

            {/* Order type tags */}
            <p className="product-details__order-types">
              Order for Yourself&nbsp;•&nbsp;Group Orders&nbsp;•&nbsp;Aso Ebi Orders
            </p>

            {/* Primary CTA */}
            <Link
              to="/chats"
              state={{
                draft: `Hello, I'd like to order ${quantity} ${quantity !== 1 ? "bundles" : "bundle"} of ${product.name}${orderDetail ? `. Extra detail: ${orderDetail}` : ""}. The estimated total is ${formatNaira(estimatedTotal)}.`,
                productContext: productChatContext(product),
              }}
              className="product-details__review-btn"
            >
              <ChatIcon />
              Review Order with a Couturier
            </Link>

            {/* Payment & logistics info */}
            <div className="product-details__info-cards">
              <div className="product-details__info-card">
                <BankIcon />
                <div>
                  <strong>Bank Transfer Only</strong>
                  <span>Upfront payment can be discussed with our team.</span>
                </div>
              </div>
              <div className="product-details__info-card">
                <TruckIcon />
                <div>
                  <strong>Delivery / Logistics</strong>
                  <span>Customer-paid; depends on your location.</span>
                </div>
              </div>
            </div>

            {/* Couturier help CTA */}
            <Link
              to="/chats"
              state={{
                draft: `Hello, I need help deciding how many bundles of ${product.name} to order.`,
                productContext: productChatContext(product),
              }}
              className="product-details__help-cta"
            >
              <span className="product-details__help-icon">
                <ChatIcon />
              </span>
              <span className="product-details__help-text">
                <strong>Need help with this fabric or unsure how many bundles to order?</strong>
                <span>Chat with a Couturier for free.</span>
              </span>
              <ChevronIcon direction="right" />
            </Link>

            {/* Secondary actions: share / save */}
            <div className="product-details__secondary-actions">
              <button type="button" className="product-details__action-link" onClick={handleShare}>
                Share this piece
              </button>
            </div>

            {/* Feedback */}
            <div className="product-details__feedback" aria-live="polite">
              {message && <p role="status">{message}</p>}
              {actionError && <p role="alert">{actionError}</p>}
              {savedError && <p role="alert">{savedError}</p>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
