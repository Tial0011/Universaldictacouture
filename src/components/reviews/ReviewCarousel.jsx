import { Children, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import ViewAllLink from "../common/ViewAllLink";
import "../discovery/DiscoveryModule.css";
import "../discovery/HomeDiscovery.css";
import "./ReviewCarousel.css";

export default function ReviewCarousel({ children, title, headingId, description, viewAll = false }) {
  const track = useRef(null);
  const trackId = useId();
  const items = Children.toArray(children);
  const isInteractingRef = useRef(false);
  const resumeTimerRef = useRef(null);
  const [position, setPosition] = useState({ index: 0, start: false, end: false });

  const repeatCount = useMemo(() => {
    if (items.length < 2) return 1;
    if (items.length <= 3) return 6;
    if (items.length <= 6) return 4;
    return 3;
  }, [items.length]);

  const repeatedItems = useMemo(() => {
    if (items.length <= 1) return items.map((child) => ({ child, key: child.key, isDuplicate: false }));
    const result = [];
    for (let r = 0; r < repeatCount; r++) {
      items.forEach((child, i) => {
        result.push({
          child,
          key: r === 0 ? child.key : `${child.key || i}-dup-${r}`,
          isDuplicate: r > 0,
        });
      });
    }
    return result;
  }, [items, repeatCount]);

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

  useLayoutEffect(() => {
    const node = track.current;
    if (!node) return undefined;

    const measure = () => {
      const cards = node.children;
      if (!cards.length || !items.length) return;
      const first = cards[0];
      const secondSetFirst = cards[items.length];
      const loopWidth = secondSetFirst && first
        ? secondSetFirst.offsetLeft - first.offsetLeft
        : 0;

      if (loopWidth > 0) {
        if (node.scrollLeft >= loopWidth * 2) {
          node.scrollLeft -= loopWidth;
        } else if (node.scrollLeft <= 2 && isInteractingRef.current) {
          node.scrollLeft += loopWidth;
        }
      }

      const step = first ? first.getBoundingClientRect().width + (parseFloat(getComputedStyle(node).gap) || 0) : 1;
      const effectiveScroll = loopWidth > 0 ? node.scrollLeft % loopWidth : node.scrollLeft;
      const rawIndex = Math.round(effectiveScroll / step);
      const relativeIndex = Math.min(Math.max(0, items.length - 1), rawIndex % Math.max(1, items.length));
      setPosition({
        index: relativeIndex,
        start: false,
        end: false,
      });
    };

    measure();
    node.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [items.length]);

  // Gentle, continuous seamless motion for Review & Feeds
  useEffect(() => {
    if (items.length <= 1) return undefined;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduced) return undefined;
    const node = track.current;
    if (!node) return undefined;

    let animId = null;
    let lastTime = performance.now();

    const tick = (now) => {
      const dt = Math.min(now - lastTime, 50);
      lastTime = now;

      if (!isInteractingRef.current && node) {
        const cards = node.children;
        if (cards && cards.length >= items.length * 2) {
          const first = cards[0];
          const secondSetFirst = cards[items.length];
          if (first && secondSetFirst) {
            const loopWidth = secondSetFirst.offsetLeft - first.offsetLeft;
            if (loopWidth > 0) {
              if (node.scrollLeft >= loopWidth) {
                node.scrollLeft -= loopWidth;
              } else if (node.scrollLeft <= 0) {
                node.scrollLeft += loopWidth;
              }
              node.scrollLeft += (dt / 1000) * 20;
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
    };
  }, [items.length]);

  const move = (direction) => {
    const node = track.current;
    if (!node) return;
    const first = node.firstElementChild;
    const step = first ? first.getBoundingClientRect().width + (parseFloat(getComputedStyle(node).gap) || 0) : 280;
    node.scrollBy({
      left: step * direction,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  };

  return (
    <div className="review-carousel discovery--home">
      <header className="discovery__head">
        {title && (
          <h2 className="discovery__title" id={headingId}>
            {title === "Review & Feeds" ? (
              <>
                <span className="discovery__title-prefix">Review </span>
                <span className="discovery__title-accent">&amp; Feeds</span>
              </>
            ) : title}
          </h2>
        )}
        <div className="discovery__head-actions">
          <div className="discovery__group-arrows" role="group" aria-label="Review navigation">
            {[-1, 1].map((direction) => (
              <button
                key={direction}
                className={`discovery__group-arrow discovery__group-arrow--${direction < 0 ? "previous" : "next"}`}
                type="button"
                aria-label={direction < 0 ? "Previous review" : "Next review"}
                aria-controls={trackId}
                disabled={false}
                onClick={() => move(direction)}
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={direction < 0 ? "M12.5 15L7.5 10L12.5 5" : "M7.5 5L12.5 10L7.5 15"} />
                </svg>
              </button>
            ))}
          </div>
          {viewAll && <ViewAllLink to="/reviews-feeds" className="discovery__view-all" />}
        </div>
      </header>
      {description && <p className="review-carousel__description">{description}</p>}
      <div className="discovery__chapter">
        <div className="discovery__chapter-track" aria-hidden="true">
          {items.map((item, index) => (
            <span key={item.key} className={index === position.index ? "is-current" : undefined} />
          ))}
        </div>
        <span className="discovery__position" aria-live="polite" aria-atomic="true">
          {String(items.length ? position.index + 1 : 0).padStart(2, "0")}
          <span> / {String(items.length).padStart(2, "0")}</span>
        </span>
      </div>
      <div
        className="review-carousel__track"
        id={trackId}
        ref={track}
        tabIndex={items.length ? 0 : -1}
        aria-label="Customer reviews — scroll to browse"
        onMouseEnter={handleInteractionStart}
        onMouseLeave={handleInteractionEnd}
        onTouchStart={handleInteractionStart}
        onTouchEnd={handleInteractionEnd}
        onPointerDown={handleInteractionStart}
        onPointerUp={handleInteractionEnd}
      >
        {repeatedItems.map(({ child, key, isDuplicate }) => (
          <div
            className="review-carousel__item"
            key={key}
            aria-hidden={isDuplicate ? "true" : undefined}
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
