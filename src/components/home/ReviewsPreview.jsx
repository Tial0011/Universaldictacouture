import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../common/Button";
import ReviewCard from "../reviews/ReviewCard";
import { useReviewInteractions } from "../reviews/useReviewInteractions";
import "./ReviewsPreview.css";

function Icon({ name }) {
  const paths = {
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    chevron: <path d="m9 18 6-6-6-6" />,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function ReviewsPreview({ entries = [], products = [], isLoading = false, error = "", onRetry }) {
  const trackRef = useRef(null);
  const [position, setPosition] = useState({ index: 0, canPrev: false, canNext: false });
  const { isLiked, toggleLike, isReviewSaved, toggleSavedReview, shareReview, piecesReady, reviewsReady, piecesError, reviewsError, retryReviewSync } = useReviewInteractions();
  const productMap = new Map(products.map((product) => [product.id, product]));

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
    const card = track.querySelector("[data-review-id]");
    const gap = Number.parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap || "0") || 0;
    const step = card ? card.getBoundingClientRect().width + gap : Math.max(300, track.clientWidth * .86);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    track.scrollBy({ left: direction * step, behavior: reduced ? "auto" : "smooth" });
  }

  const totalLabel = String(entries.length || 0).padStart(2, "0");
  const currentLabel = String(entries.length ? position.index + 1 : 0).padStart(2, "0");

  return <section className="review-showcase" aria-labelledby="home-reviews">
    <div className="review-showcase__loom review-showcase__loom--left" aria-hidden="true" />
    <div className="review-showcase__loom review-showcase__loom--right" aria-hidden="true" />
    <div className="container review-showcase__inner">
      <header className="review-showcase__header">
        <div className="review-showcase__title-wrap">
          <span className="review-showcase__eyebrow">Customer stories · Woven into the house</span>
          <h2 id="home-reviews">Review <span>&amp; Feeds</span></h2>
          <p>Real moments, honest feedback, and the pieces our customers made their own.</p>
        </div>
        <div className="review-showcase__controls">
          <div className="review-showcase__arrows" aria-label="Review carousel navigation">
            <button type="button" aria-label="Previous reviews" disabled={!position.canPrev} onClick={() => scroll(-1)}><Icon name="chevron" /></button>
            <button type="button" aria-label="Next reviews" disabled={!position.canNext} onClick={() => scroll(1)}><Icon name="chevron" /></button>
          </div>
          <span className="review-showcase__progress" aria-label={`Review ${entries.length ? position.index + 1 : 0} of ${entries.length}`}>{currentLabel} <i aria-hidden="true" /> {totalLabel}</span>
          <Link className="review-showcase__view-all" to="/reviews-feeds">View all <Icon name="arrow" /></Link>
        </div>
      </header>

      <div className="review-showcase__woven-rule" aria-hidden="true"><span /><span /><span /></div>

      {piecesError && <p role="alert">{piecesError}</p>}
      {reviewsError && <div role="status"><p>{reviewsError}</p>{retryReviewSync && <Button variant="secondary" onClick={retryReviewSync}>Retry account sync</Button>}</div>}

      {isLoading ? <div className="review-showcase__loading" role="status" aria-label="Loading Review & Feeds">
        {[0, 1, 2].map((item) => <div key={item} className="review-showcase__skeleton"><div /><span /><span /></div>)}
      </div> : error ? <div className="review-showcase__state" role="alert"><span className="review-showcase__state-motif" aria-hidden="true" /><h3>Customer stories are taking a moment.</h3><p>{error}</p>{onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}</div>
      : entries.length === 0 ? <div className="review-showcase__state"><span className="review-showcase__state-motif" aria-hidden="true" /><h3>The story wall is ready.</h3><p>Published customer reviews will appear here automatically.</p></div>
      : <div className={`review-showcase__track${entries.length === 1 ? " is-single" : ""}`} ref={trackRef} tabIndex="0" aria-label="Latest published reviews">
          {entries.map((entry) => <ReviewCard
            key={entry.id}
            entry={entry}
            product={productMap.get(entry.productId) || null}
            variant="home"
            liked={isLiked(entry.id, productMap.get(entry.productId))}
            saved={isReviewSaved(entry.id)}
            likeReady={!productMap.has(entry.productId) || piecesReady}
            saveReady={reviewsReady}
            onLike={() => toggleLike(entry.id, productMap.get(entry.productId))}
            onSave={() => toggleSavedReview(entry.id)}
            onShare={shareReview}
          />)}
        </div>}
    </div>
  </section>;
}
