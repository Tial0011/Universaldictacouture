import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import NewInCard from "./NewInCard";
import LoadingSpinner from "../common/LoadingSpinner";
import ViewAllLink from "../common/ViewAllLink";
import "./NewIn.css";

/**
 * Small chevron for the New In carousel controls — drawn to the same
 * stroke/viewBox convention as the Shop By and Review & Feeds arrows,
 * and kept local to this component the same way those are.
 */
function ChevronIcon({ direction }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={direction === "previous" ? "M12.5 15L7.5 10L12.5 5" : "M7.5 5L12.5 10L7.5 15"} />
    </svg>
  );
}

/**
 * New In. `products` is always the newest published pieces (see
 * selectNewIn in services/products) — never a manually curated list
 * and never filtered by category — rendered as a single horizontal
 * carousel so the homepage stays compact instead of growing into a
 * multi-row grid. The header, arrows and scroll progress are
 * coordinated with the Shop By carousel above it; the cards themselves
 * remain real product cards (see NewInCard), not category tiles.
 */
export default function NewIn({ products, isLoading, error, viewAllTo = "/shop" }) {
  const trackRef = useRef(null);
  const [scrollState, setScrollState] = useState({
    index: 0,
    canPrev: false,
    canNext: false,
    thumbLeft: 0,
    thumbWidth: 100,
  });

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;

    const update = () => {
      const maxScroll = track.scrollWidth - track.clientWidth;
      const ratio = maxScroll > 0 ? track.scrollLeft / maxScroll : 0;
      const thumbWidth = track.scrollWidth > 0
        ? Math.min(100, (track.clientWidth / track.scrollWidth) * 100)
        : 100;
      const thumbLeft = Math.min(100 - thumbWidth, Math.max(0, ratio * (100 - thumbWidth)));

      // Nearest-card index, purely for the "01 / 20" readout — mirrors
      // the same approach already used by the Review & Feeds carousel.
      const cards = Array.from(track.querySelectorAll("[data-new-in-item]"));
      let index = 0;
      let distance = Infinity;
      cards.forEach((card, cardIndex) => {
        const nextDistance = Math.abs(card.offsetLeft - track.scrollLeft - track.offsetLeft);
        if (nextDistance < distance) {
          distance = nextDistance;
          index = cardIndex;
        }
      });

      setScrollState({
        index,
        canPrev: track.scrollLeft > 8,
        canNext: track.scrollLeft + track.clientWidth < track.scrollWidth - 8,
        thumbLeft,
        thumbWidth,
      });
    };

    update();
    track.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(track);
    return () => {
      track.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [products.length]);

  function scroll(direction) {
    const track = trackRef.current;
    if (!track) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    track.scrollBy({
      left: direction * Math.max(240, track.clientWidth * 0.78),
      behavior: reduced ? "auto" : "smooth",
    });
  }

  const showControls = !isLoading && !error && products.length > 1;

  return (
    <section className="home-section container" aria-labelledby="home-new-in">
      <div className="home-section__head new-in__head">
        <h2 id="home-new-in">New In</h2>
        <div className="new-in__controls">
          {showControls ? (
            <div className="new-in__arrows" role="group" aria-label="New In navigation">
              <button
                type="button"
                aria-label="Previous new pieces"
                aria-controls="new-in-track"
                disabled={!scrollState.canPrev}
                onClick={() => scroll(-1)}
              >
                <ChevronIcon direction="previous" />
              </button>
              <button
                type="button"
                aria-label="Next new pieces"
                aria-controls="new-in-track"
                disabled={!scrollState.canNext}
                onClick={() => scroll(1)}
              >
                <ChevronIcon direction="next" />
              </button>
            </div>
          ) : null}
          <ViewAllLink to={viewAllTo} />
        </div>
      </div>

      {showControls ? (
        <div className="new-in__progress" aria-hidden="true">
          <div className="new-in__progress-track">
            <span
              className="new-in__progress-thumb"
              style={{ left: `${scrollState.thumbLeft}%`, width: `${scrollState.thumbWidth}%` }}
            />
          </div>
          <span className="new-in__position">
            {String(scrollState.index + 1).padStart(2, "0")}
            <span> / {String(products.length).padStart(2, "0")}</span>
          </span>
        </div>
      ) : null}

      {isLoading ? <LoadingSpinner label="Loading new pieces" /> : null}

      {!isLoading && error ? (
        <p className="home-section__note">
          New In could not be loaded right now. Please refresh to try again.
        </p>
      ) : null}

      {!isLoading && !error && products.length === 0 ? (
        <p className="home-section__note">
          No new pieces are published yet. <Link to="/shop">Browse the collection</Link> in the
          meantime.
        </p>
      ) : null}

      {!isLoading && !error && products.length > 0 ? (
        <ul className="menu-grid" id="new-in-track" ref={trackRef} aria-label="New In">
          {products.map((product, index) => (
            <li key={product.id} data-new-in-item>
              <NewInCard product={product} imageLoading={index < 4 ? "eager" : "lazy"} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
