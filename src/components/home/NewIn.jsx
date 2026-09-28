import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import NewInCard from "./NewInCard";
import LoadingSpinner from "../common/LoadingSpinner";
import ViewAllLink from "../common/ViewAllLink";
// Use the exact Shop By styling so the two headers cannot drift apart.
import "../discovery/DiscoveryModule.css";
import "../discovery/HomeDiscovery.css";

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
 * New In. `products` is the admin-curated New In merchandising set
 * (see selectNewIn in services/products), ordered deterministically by
 * first-published chronology and rendered as a single horizontal
 * carousel so the homepage stays compact instead of growing into a
 * multi-row grid. The header, arrows and scroll progress are
 * coordinated with the Shop By carousel above it; the cards themselves
 * remain real product cards (see NewInCard), not category tiles.
 */
export default function NewIn({ products, isLoading, error, viewAllTo = "/shop" }) {
  const trackRef = useRef(null);
  const isInteractingRef = useRef(false);
  const resumeTimerRef = useRef(null);
  const [scrollState, setScrollState] = useState({
    index: 0,
    canPrev: false,
    canNext: true,
  });

  const handleInteractionStart = () => {
    clearTimeout(resumeTimerRef.current);
    isInteractingRef.current = true;
  };

  const handleInteractionEnd = () => {
    clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      isInteractingRef.current = false;
    }, 2400);
  };

  const update = () => {
    const track = trackRef.current;
    if (!track) return;

    if (products.length > 2) {
      const halfWidth = track.scrollWidth / 2;
      if (halfWidth > 0) {
        if (track.scrollLeft >= halfWidth * 1.5) {
          track.scrollLeft -= halfWidth;
        } else if (track.scrollLeft <= 2 && isInteractingRef.current) {
          track.scrollLeft += halfWidth;
        }
      }
    }

    const cards = Array.from(track.querySelectorAll("[data-new-in-item]"));
    let index = 0;
    let distance = Infinity;
    const baseCards = cards.slice(0, products.length);
    baseCards.forEach((card, cardIndex) => {
      const cardPos = card.offsetLeft - track.offsetLeft;
      const effectiveScroll = products.length > 2
        ? track.scrollLeft % (track.scrollWidth / 2 || 1)
        : track.scrollLeft;
      const nextDistance = Math.abs(cardPos - effectiveScroll);
      if (nextDistance < distance) {
        distance = nextDistance;
        index = cardIndex;
      }
    });

    setScrollState({
      index: index % Math.max(1, products.length),
      canPrev: track.scrollLeft > 8,
      canNext: true,
    });
  };

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;

    update();
    track.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(track);
    return () => {
      track.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [products, isLoading, error]);

  // Gentle, continuous seamless motion for New In
  useEffect(() => {
    if (isLoading || error || products.length <= 2) return undefined;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduced) return undefined;
    const track = trackRef.current;
    if (!track) return undefined;

    let animId = null;
    let lastTime = performance.now();

    const tick = (now) => {
      const dt = Math.min(now - lastTime, 50);
      lastTime = now;

      if (!isInteractingRef.current && track) {
        const halfWidth = track.scrollWidth / 2;
        if (halfWidth > track.clientWidth) {
          if (track.scrollLeft >= halfWidth) {
            track.scrollLeft -= halfWidth;
          } else if (track.scrollLeft <= 0) {
            track.scrollLeft += halfWidth;
          }
          track.scrollLeft += (dt / 1000) * 18;
        }
      }
      animId = requestAnimationFrame(tick);
    };

    const startTimer = setTimeout(() => {
      lastTime = performance.now();
      animId = requestAnimationFrame(tick);
    }, 1200);

    return () => {
      clearTimeout(startTimer);
      clearTimeout(resumeTimerRef.current);
      if (animId) cancelAnimationFrame(animId);
    };
  }, [products, isLoading, error]);

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
    <section className="home-section container discovery--home" aria-labelledby="home-new-in">
      <div className="discovery__head">
        <h2 id="home-new-in" className="discovery__title"><span className="discovery__title-prefix">New </span><span className="discovery__title-accent">In</span></h2>
        <div className="discovery__head-actions">
          {showControls ? (
            <div className="discovery__group-arrows" role="group" aria-label="New In navigation">
              <button
                type="button"
                aria-label="Previous new pieces"
                className="discovery__group-arrow discovery__group-arrow--previous"
                aria-controls="new-in-track"
                disabled={!scrollState.canPrev}
                onClick={() => scroll(-1)}
              >
                <ChevronIcon direction="previous" />
              </button>
              <button
                type="button"
                aria-label="Next new pieces"
                className="discovery__group-arrow discovery__group-arrow--next"
                aria-controls="new-in-track"
                disabled={!scrollState.canNext}
                onClick={() => scroll(1)}
              >
                <ChevronIcon direction="next" />
              </button>
            </div>
          ) : null}
          <ViewAllLink to={viewAllTo} className="discovery__view-all" />
        </div>
      </div>

      {showControls ? (
        <div className="discovery__chapter" aria-hidden="true">
          <div className="discovery__chapter-track">
            {products.map((product, index) => <span key={product.id} className={index === scrollState.index ? "is-current" : undefined} />)}
          </div>
          <span className="discovery__position">
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
        <ul
          className="menu-grid"
          id="new-in-track"
          ref={trackRef}
          aria-label="New In"
          onMouseEnter={handleInteractionStart}
          onMouseLeave={handleInteractionEnd}
          onTouchStart={handleInteractionStart}
          onTouchEnd={handleInteractionEnd}
          onPointerDown={handleInteractionStart}
          onPointerUp={handleInteractionEnd}
        >
          {products.map((product, index) => (
            <li key={product.id} data-new-in-item>
              <NewInCard product={product} imageLoading={index < 4 ? "eager" : "lazy"} />
            </li>
          ))}
          {products.length > 2 && products.map((product) => (
            <li key={`${product.id}-dup`} data-new-in-item aria-hidden="true">
              <NewInCard product={product} imageLoading="lazy" />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
