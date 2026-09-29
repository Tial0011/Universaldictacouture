import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useAuthGate } from "../../context/AuthGateContext";
import ProductImage from "../product/ProductImage";
import { formatNaira, truncateText } from "../../utils/formatters";
import { PRODUCT_SHOP_CTA } from "../../utils/productCopy";
import { timestampDate } from "../../services/reviewModel";
import { productChatContext } from "../../services/chatModel";
import "./ReviewCard.css";

const HOME_PREVIEW_LENGTH = 150;
const FEED_PREVIEW_LENGTH = 150;

function Icon({ name, filled = false }) {
  const paths = {
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
    bookmark: <path d="M6 3h12v18l-6-4-6 4V3Z" />,
    share: <><circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5M8 13l8 5"/></>,
    chat: <path d="M4 5h16v11H9l-5 4V5Z" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function Stars({ value, label }) {
  return <div className="udc-review-rating" aria-label={value ? `${label}: ${value} out of 5 stars` : `${label}: not rated`}>
    <span>{label}</span>
    {value ? <span className="udc-review-rating__stars" aria-hidden="true">{[1, 2, 3, 4, 5].map((star) => <i key={star} className={star <= value ? "is-filled" : ""}>★</i>)}</span>
      : <small>Not rated</small>}
  </div>;
}

function formatReviewDate(entry) {
  const date = timestampDate(entry.publishedAt || entry.submittedAt || entry.createdAt);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function productPresentation(entry, product) {
  if (product) {
    return {
      available: true,
      name: product.name,
      image: product.image,
      price: product.minPrice,
      variable: product.hasVariablePricing,
      href: product.href,
    };
  }
  const snapshot = entry.productSnapshot;
  if (!snapshot) return null;
  return {
    available: false,
    name: snapshot.name || "Previously reviewed piece",
    image: snapshot.image || null,
    price: snapshot.price,
    variable: false,
    href: "",
  };
}

export default function ReviewCard({
  entry,
  product = null,
  variant = "feed",
  liked = false,
  saved = false,
  likeReady = true,
  saveReady = true,
  onLike,
  onSave,
  onShare,
  showDate = false,
  forceExpanded = false,
}) {
  const { user } = useAuth();
  const { requestAuth } = useAuthGate();
  const navigate = useNavigate();
  const location = useLocation();

  const [expanded, setExpanded] = useState(false);
  const presentation = productPresentation(entry, product);
  const previewLength = variant === "home" ? HOME_PREVIEW_LENGTH : FEED_PREVIEW_LENGTH;
  const longReview = entry.body.length > previewLength;
  const reviewText = expanded || forceExpanded ? entry.body : truncateText(entry.body, previewLength);
  const reviewRoute = `/reviews-feeds?review=${encodeURIComponent(entry.id)}`;
  const reviewDate = showDate ? formatReviewDate(entry) : "";
  const chatDraft = presentation?.name
    ? `I’m interested in ${presentation.name} after reading ${entry.author || "a customer"}'s review.`
    : `I’d like to ask about a customer review (${entry.id}).`;

  const productContext = productChatContext(product, entry);
  return <article className={`udc-review-card udc-review-card--${variant} udc-review-card--${entry.image ? "photo" : "written"}`} data-review-id={entry.id} tabIndex={-1}>
    {entry.image ? <div className="udc-review-card__media">
      <ProductImage image={entry.image} alt={entry.image.alt || `${entry.author || "Customer"} review photo`} transformation="w_800,h_1200,c_limit,q_auto,f_auto" />
      <button className="udc-review-card__photo-like" type="button" aria-label={liked ? "Unlike reviewed piece" : "Like reviewed piece"} aria-pressed={liked} disabled={!likeReady} onClick={() => onLike?.(entry)}><Icon name="heart" filled={liked} /></button>
    </div> : null}

    <div className="udc-review-card__body">
      <div className="udc-review-card__identity">
        <div>
          <h3>{entry.author || "Universal Dicta customer"}</h3>
          {reviewDate && <time dateTime={timestampDate(entry.publishedAt || entry.submittedAt || entry.createdAt)?.toISOString()}>{reviewDate}</time>}
        </div>
      </div>

      <p className="udc-review-card__copy">{reviewText}</p>
      {longReview && !forceExpanded && (variant === "home"
        ? <Link className="udc-review-card__read-more" to={reviewRoute}>Read more <Icon name="arrow" /></Link>
        : <button className="udc-review-card__read-more" type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? "Read less" : "Read more"} <Icon name="arrow" /></button>)}

      <div className="udc-review-card__ratings">
        <Stars label="Customer Service" value={entry.customerServiceRating} />
        <Stars label="Product Quality" value={entry.productQualityRating} />
      </div>

      <div className={`udc-review-product${presentation?.available === false ? " is-unavailable" : ""}`}>
        {presentation ? <>
          <div className="udc-review-product__thumb">{presentation.image
            ? <ProductImage image={presentation.image} alt={presentation.name} transformation="w_180,h_180,c_fill,g_auto,q_auto,f_auto" />
            : null}</div>
          <div className="udc-review-product__copy">
            <strong>{presentation.name}</strong>
            {presentation.price != null && <small>{formatNaira(presentation.price)}{presentation.variable ? " +" : ""}</small>}
          </div>
          {presentation.available
            ? <Link className="udc-review-product__cta" to={presentation.href} aria-label={`Shop ${presentation.name}`}>{PRODUCT_SHOP_CTA} <Icon name="arrow" /></Link>
            : <span className="udc-review-product__unavailable">Currently unavailable</span>}
        </> : <div className="udc-review-product__missing"><strong>Reviewed piece unavailable</strong><span>The customer story remains published, but this product is no longer in the live catalogue.</span></div>}
      </div>

      <div className="udc-review-card__actions" aria-label={`Actions for ${entry.author || "customer"} review`}>
        <button type="button" className={liked ? "is-selected" : ""} aria-pressed={liked} aria-label={product ? `${liked ? "Unlike" : "Like"} ${product.name} ${liked ? "in" : "and add to"} My Pieces` : `${liked ? "Unlike" : "Like"} this review`} disabled={!likeReady} onClick={() => onLike?.(entry)}><Icon name="heart" filled={liked} /><span>{liked ? "Liked" : "Like"}</span></button>
        <button type="button" className={saved ? "is-selected" : ""} aria-pressed={saved} aria-label={`${saved ? "Remove" : "Save"} this review ${saved ? "from" : "to"} Saved Reviews`} disabled={!saveReady} onClick={() => onSave?.(entry)}><Icon name="bookmark" filled={saved} /><span>{saved ? "Saved" : "Save"}</span></button>
        <button type="button" onClick={() => onShare?.(entry, product)}><Icon name="share" /><span>Share</span></button>
        <button type="button" aria-label={`Chat with the studio about ${presentation?.name || "this review"}`} onClick={() => {
          if (!user) { requestAuth({ returnTo: `${location.pathname}${location.search}`, returnState: null }); return; }
          navigate("/chats", { state: { draft: chatDraft, productContext } });
        }}><Icon name="chat" /><span>Chat</span></button>
      </div>
    </div>
  </article>;
}
