<<<<<<< HEAD
import { useEffect, useRef, useState } from "react";
=======
import { useEffect, useMemo, useRef, useState } from "react";
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
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
<<<<<<< HEAD
=======
function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function continuousRailSpeed(node) {
  const width = node?.clientWidth || 0;
  return Math.min(52, Math.max(24, width * 0.04));
}

>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
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
<<<<<<< HEAD
 * New In. `products` is always the newest published pieces (see
 * selectNewIn in services/products) — never a manually curated list
 * and never filtered by category — rendered as a single horizontal
=======
 * New In. `products` is the admin-curated New In merchandising set
 * (see selectNewIn in services/products), ordered deterministically by
 * first-published chronology and rendered as a single horizontal
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
 * carousel so the homepage stays compact instead of growing into a
 * multi-row grid. The header, arrows and scroll progress are
 * coordinated with the Shop By carousel above it; the cards themselves
 * remain real product cards (see NewInCard), not category tiles.
 */
export default function NewIn({ products, isLoading, error, viewAllTo = "/shop" }) {
  const trackRef = useRef(null);
<<<<<<< HEAD
  const [scrollState, setScrollState] = useState({
    index: 0,
    canPrev: false,
    canNext: false,
  });

=======
  const isInteractingRef = useRef(false);
  const resumeTimerRef = useRef(null);
  const [scrollState, setScrollState] = useState({
    index: 0,
    canPrev: true,
    canNext: true,
  });

  const repeatCount = useMemo(() => {
    if (products.length < 2) return 1;
    if (products.length <= 3) return 6;
    if (products.length <= 6) return 4;
    return 3;
  }, [products.length]);

  const repeatedProducts = useMemo(() => {
    if (products.length <= 1) return products.map((product) => ({ product, key: product.id, isDuplicate: false }));
    const result = [];
    for (let r = 0; r < repeatCount; r++) {
      products.forEach((product) => {
        result.push({
          product,
          key: r === 0 ? product.id : `${product.id}-dup-${r}`,
          isDuplicate: r > 0,
        });
      });
    }
    return result;
  }, [products, repeatCount]);

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
    const cards = Array.from(track.querySelectorAll("[data-new-in-item]"));
    if (!cards.length || !products.length) return;

    const firstCard = cards[0];
    const secondSetFirst = cards[products.length];
    const loopWidth = secondSetFirst && firstCard
      ? secondSetFirst.offsetLeft - firstCard.offsetLeft
      : 0;

    if (loopWidth > 0) {
      if (track.scrollLeft >= loopWidth * 2) {
        track.scrollLeft -= loopWidth;
      } else if (track.scrollLeft <= 2 && isInteractingRef.current) {
        track.scrollLeft += loopWidth;
      }
    }

    const effectiveScroll = loopWidth > 0 ? track.scrollLeft % loopWidth : track.scrollLeft;

    let index = 0;
    let distance = Infinity;
    for (let i = 0; i < products.length; i++) {
      const card = cards[i];
      if (!card) break;
      const cardPos = card.offsetLeft - track.offsetLeft;
      const nextDistance = Math.abs(cardPos - effectiveScroll);
      if (nextDistance < distance) {
        distance = nextDistance;
        index = i;
      }
    }

    setScrollState({
      index: index % products.length,
      canPrev: true,
      canNext: true,
    });
  };

>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;

<<<<<<< HEAD
    const update = () => {
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
      });
    };

=======
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
    update();
    track.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(track);
<<<<<<< HEAD
    return () => {
      track.removeEventListener("scroll", update);
      observer?.disconnect();
=======
    window.addEventListener("resize", update);
    return () => {
      track.removeEventListener("scroll", update);
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [products, isLoading, error]);

  // Gentle, continuous seamless motion for New In
  useEffect(() => {
    if (isLoading || error || products.length <= 1 || prefersReducedMotion()) return undefined;
    const track = trackRef.current;
    if (!track) return undefined;

    let animId = null;
    let lastTime = performance.now();

    const tick = (now) => {
      const dt = Math.min(now - lastTime, 50);
      lastTime = now;

      if (!isInteractingRef.current && track) {
        const cards = track.children;
        if (cards && cards.length >= products.length * 2) {
          const firstCard = cards[0];
          const secondSetFirst = cards[products.length];
          if (firstCard && secondSetFirst) {
            const loopWidth = secondSetFirst.offsetLeft - firstCard.offsetLeft;
            if (loopWidth > 0) {
              if (track.scrollLeft >= loopWidth) {
                track.scrollLeft -= loopWidth;
              } else if (track.scrollLeft <= 0) {
                track.scrollLeft += loopWidth;
              }
              track.scrollLeft += (dt / 1000) * continuousRailSpeed(track);
            }
          }
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
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
    };
  }, [products, isLoading, error]);

  function scroll(direction) {
    const track = trackRef.current;
    if (!track) return;
<<<<<<< HEAD
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    track.scrollBy({
      left: direction * Math.max(240, track.clientWidth * 0.78),
      behavior: reduced ? "auto" : "smooth",
    });
=======
    handleInteractionStart();
    track.scrollBy({
      left: direction * Math.max(240, track.clientWidth * 0.78),
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    handleInteractionEnd();
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
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
<<<<<<< HEAD
                disabled={!scrollState.canPrev}
=======
                disabled={false}
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
                onClick={() => scroll(-1)}
              >
                <ChevronIcon direction="previous" />
              </button>
              <button
                type="button"
                aria-label="Next new pieces"
                className="discovery__group-arrow discovery__group-arrow--next"
                aria-controls="new-in-track"
<<<<<<< HEAD
                disabled={!scrollState.canNext}
=======
                disabled={false}
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
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
<<<<<<< HEAD
        <ul className="menu-grid" id="new-in-track" ref={trackRef} aria-label="New In">
          {products.map((product, index) => (
            <li key={product.id} data-new-in-item>
=======
        <ul
          className="menu-grid"
          id="new-in-track"
          ref={trackRef}
          aria-label="New In"
          onWheel={() => {
            handleInteractionStart();
            handleInteractionEnd();
          }}
          onTouchStart={handleInteractionStart}
          onTouchEnd={handleInteractionEnd}
          onPointerDown={handleInteractionStart}
          onPointerUp={handleInteractionEnd}
          onPointerCancel={handleInteractionEnd}
          onPointerLeave={handleInteractionEnd}
        >
          {repeatedProducts.map(({ product, key, isDuplicate }, index) => (
            <li key={key} data-new-in-item aria-hidden={isDuplicate ? "true" : undefined}>
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
              <NewInCard product={product} imageLoading={index < 4 ? "eager" : "lazy"} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
