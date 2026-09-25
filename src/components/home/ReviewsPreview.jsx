import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ProductImage from "../product/ProductImage";
import Button from "../common/Button";
import { useSavedPieces } from "../../context/SavedPiecesContext";
import { formatNaira, truncateText } from "../../utils/formatters";
import "./ReviewsPreview.css";

const REVIEW_PREVIEW_LENGTH = 158;
const LIKED_KEY = "udc:review-likes:session";
const SAVED_KEY = "udc:saved-reviews:session";

function readSessionIds(key) {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeSessionIds(key, ids) {
  try { sessionStorage.setItem(key, JSON.stringify(ids)); } catch { /* memory-only fallback */ }
}

function Icon({ name }) {
  const paths = {
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
    bookmark: <path d="M6 3h12v18l-6-4-6 4V3Z" />,
    share: <><circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5M8 13l8 5"/></>,
    chat: <path d="M4 5h16v11H9l-5 4V5Z" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    chevron: <path d="m9 18 6-6-6-6" />,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function Stars({ value, label }) {
  if (!value) return <div className="review-rating review-rating--missing"><span>{label}</span><small>Not rated</small></div>;
  return <div className="review-rating" aria-label={`${label}: ${value} out of 5 stars`}>
    <span>{label}</span>
    <span className="review-rating__stars" aria-hidden="true">{[1, 2, 3, 4, 5].map((star) => <span key={star} className={star <= value ? "is-filled" : ""}>★</span>)}</span>
  </div>;
}

function ReviewCard({ entry, product, liked, savedReview, onLike, onSaveReview, onShare }) {
  const { isSaved, toggleSaved } = useSavedPieces();
  const productSaved = product ? isSaved(product.id) : false;
  const excerpt = truncateText(entry.body, REVIEW_PREVIEW_LENGTH);
  const needsReadMore = entry.body.length > REVIEW_PREVIEW_LENGTH;
  const extraImages = Math.max(0, (entry.images?.length || 0) - 1);
  const reviewRoute = `/reviews-feeds?review=${encodeURIComponent(entry.id)}`;
  const chatDraft = product
    ? `I’m interested in ${product.name} after seeing ${entry.author || "a customer"}'s review.`
    : `I’d like to ask about a piece mentioned in a customer review (${entry.id}).`;

  return <article className="review-card" data-review-id={entry.id}>
    <div className="review-card__media">
      {entry.image ? <ProductImage image={entry.image} alt={entry.image.alt || `${entry.author || "Customer"} review`} transformation="w_900,h_720,c_fill,g_auto,q_auto,f_auto" /> : <div className="review-card__image-placeholder" role="img" aria-label="Review photo unavailable"><span>UDC</span></div>}
      {extraImages > 0 && <span className="review-card__image-count" aria-label={`${extraImages} additional review image${extraImages === 1 ? "" : "s"}`}>+{extraImages}</span>}
      <button className={`review-card__product-heart${productSaved ? " is-selected" : ""}`} type="button" disabled={!product} aria-pressed={productSaved} aria-label={product ? `${productSaved ? "Remove" : "Save"} ${product.name} ${productSaved ? "from" : "to"} My Closet` : "Tagged product unavailable"} onClick={() => product && toggleSaved(product.id)}>
        <Icon name="heart" />
      </button>
    </div>

    <div className="review-card__story">
      <div className="review-card__identity">
        <span className="review-card__quote" aria-hidden="true">“</span>
        <h3>{entry.author || "Universal Dicta customer"}</h3>
      </div>
      <p className="review-card__excerpt">{excerpt}</p>
      {needsReadMore && <Link className="review-card__read-more" to={reviewRoute}>Read more <Icon name="arrow" /></Link>}
    </div>

    <div className="review-card__ratings">
      <Stars label="Customer Service" value={entry.customerServiceRating} />
      <Stars label="Product Quality" value={entry.productQualityRating} />
    </div>

    <div className={`review-card__product${product ? "" : " review-card__product--missing"}`}>
      {product ? <>
        <div className="review-card__product-image"><ProductImage image={product.image} alt={product.name} transformation="w_180,h_180,c_fill,g_auto,q_auto,f_auto" /></div>
        <div className="review-card__product-copy">
          <span className="review-card__product-kicker">Reviewed piece</span>
          <strong>{product.name}</strong>
          <span>{formatNaira(product.minPrice)}{product.hasVariablePricing ? " +" : ""}</span>
        </div>
        <Link className="review-card__shop-link" to={product.href}>Shop This Piece <Icon name="arrow" /></Link>
      </> : <div className="review-card__missing-copy"><strong>Tagged piece unavailable</strong><span>This review remains visible, but the product is no longer available to shop.</span></div>}
    </div>

    <div className="review-card__actions" aria-label={`Actions for ${entry.author || "customer"} review`}>
      <button type="button" className={liked ? "is-selected" : ""} aria-pressed={liked} onClick={() => onLike(entry)}><Icon name="heart" /><span>Like{entry.likeCount + (liked ? 1 : 0) > 0 ? ` ${entry.likeCount + (liked ? 1 : 0)}` : ""}</span></button>
      <button type="button" className={savedReview ? "is-selected" : ""} aria-pressed={savedReview} onClick={() => onSaveReview(entry)}><Icon name="bookmark" /><span>Save</span></button>
      <button type="button" onClick={() => onShare(entry, product)}><Icon name="share" /><span>Share</span></button>
      <Link to="/chats" state={{ draft: chatDraft }}><Icon name="chat" /><span>Chat</span></Link>
    </div>
  </article>;
}

export default function ReviewsPreview({ entries = [], products = [], isLoading = false, error = "", onRetry }) {
  const trackRef = useRef(null);
  const [likedIds, setLikedIds] = useState(() => readSessionIds(LIKED_KEY));
  const [savedReviewIds, setSavedReviewIds] = useState(() => readSessionIds(SAVED_KEY));
  const [position, setPosition] = useState({ index: 0, canPrev: false, canNext: false });
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    const update = () => {
      const cards = Array.from(track.querySelectorAll("[data-review-id]"));
      let index = 0;
      let distance = Infinity;
      cards.forEach((card, cardIndex) => {
        const nextDistance = Math.abs(card.offsetLeft - track.scrollLeft - track.offsetLeft);
        if (nextDistance < distance) { distance = nextDistance; index = cardIndex; }
      });
      setPosition({
        index,
        canPrev: track.scrollLeft > 8,
        canNext: track.scrollLeft + track.clientWidth < track.scrollWidth - 8,
      });
    };
    update();
    track.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(track);
    return () => { track.removeEventListener("scroll", update); observer?.disconnect(); };
  }, [entries.length]);

  function scroll(direction) {
    const track = trackRef.current;
    if (!track) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    track.scrollBy({ left: direction * Math.max(280, track.clientWidth * .82), behavior: reduced ? "auto" : "smooth" });
  }

  function toggleSession(setter, key, id) {
    setter((previous) => {
      const next = previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id];
      writeSessionIds(key, next);
      return next;
    });
  }

  async function shareReview(entry, product) {
    const target = product?.href || `/reviews-feeds?review=${encodeURIComponent(entry.id)}`;
    const url = new URL(target, window.location.origin).toString();
    const text = `${truncateText(entry.body, 180)}${product ? ` — ${product.name}` : ""}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Review & Feeds — ${product?.name || "Universal Dicta Couture"}`, text, url });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        return;
      }
      window.prompt("Copy this review and link", `${text}\n${url}`);
    } catch (shareError) {
      if (shareError?.name !== "AbortError") window.prompt("Copy this review and link", `${text}\n${url}`);
    }
  }

  const totalLabel = String(entries.length || 0).padStart(2, "0");
  const currentLabel = String(entries.length ? position.index + 1 : 0).padStart(2, "0");

  return <section className="review-showcase" aria-labelledby="home-reviews">
    <div className="review-showcase__pattern review-showcase__pattern--left" aria-hidden="true" />
    <div className="review-showcase__pattern review-showcase__pattern--right" aria-hidden="true" />
    <div className="container review-showcase__inner">
      <header className="review-showcase__header">
        <div className="review-showcase__title-wrap">
          <span className="review-showcase__eyebrow">Customer stories · Woven into the house</span>
          <h2 id="home-reviews">Review <span>&amp; Feeds</span></h2>
          <p>{entries.length ? `The latest ${entries.length} published customer ${entries.length === 1 ? "story" : "stories"}, paired with the pieces that inspired them.` : "Stories from the people wearing Universal Dicta Couture."}</p>
        </div>
        <div className="review-showcase__controls">
          <div className="review-showcase__arrows" aria-label="Review carousel navigation">
            <button type="button" aria-label="Previous reviews" disabled={!position.canPrev} onClick={() => scroll(-1)}><Icon name="chevron" /></button>
            <button type="button" aria-label="Next reviews" disabled={!position.canNext} onClick={() => scroll(1)}><Icon name="chevron" /></button>
          </div>
          <span className="review-showcase__progress" aria-label={`Review ${position.index + 1} of ${entries.length}`}>{currentLabel} <i aria-hidden="true" /> {totalLabel}</span>
          <Link className="review-showcase__view-all" to="/reviews-feeds">View all <Icon name="arrow" /></Link>
        </div>
      </header>

      <div className="review-showcase__woven-rule" aria-hidden="true"><span /><span /><span /></div>

      {isLoading ? <div className="review-showcase__loading" role="status" aria-label="Loading Review & Feeds">
        {[0, 1, 2].map((item) => <div key={item} className="review-card review-card--skeleton"><div className="review-card__skeleton-media"/><div className="review-card__skeleton-line"/><div className="review-card__skeleton-line review-card__skeleton-line--short"/></div>)}
      </div> : error ? <div className="review-showcase__state" role="alert"><span className="review-showcase__state-motif" aria-hidden="true" /><h3>Customer stories are taking a moment.</h3><p>{error}</p>{onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}</div>
      : entries.length === 0 ? <div className="review-showcase__state"><span className="review-showcase__state-motif" aria-hidden="true" /><h3>The story wall is ready.</h3><p>Published customer reviews will appear here automatically.</p></div>
      : <div className="review-showcase__track" ref={trackRef} tabIndex="0" aria-label="Latest published reviews">
          {entries.map((entry) => <ReviewCard
            key={entry.id}
            entry={entry}
            product={productMap.get(entry.productId) || null}
            liked={likedIds.includes(entry.id)}
            savedReview={savedReviewIds.includes(entry.id)}
            onLike={(review) => toggleSession(setLikedIds, LIKED_KEY, review.id)}
            onSaveReview={(review) => toggleSession(setSavedReviewIds, SAVED_KEY, review.id)}
            onShare={shareReview}
          />)}
        </div>}
    </div>
  </section>;
}
