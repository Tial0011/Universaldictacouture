import { Children, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
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
  const [position, setPosition] = useState({ index: 0, start: true, end: false });

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
      if (items.length > 2) {
        const halfWidth = node.scrollWidth / 2;
        if (halfWidth > 0) {
          if (node.scrollLeft >= halfWidth * 1.5) {
            node.scrollLeft -= halfWidth;
          } else if (node.scrollLeft <= 2 && isInteractingRef.current) {
            node.scrollLeft += halfWidth;
          }
        }
      }
      const first = node.firstElementChild;
      const step = first ? first.getBoundingClientRect().width + (parseFloat(getComputedStyle(node).gap) || 0) : 1;
      const rawIndex = Math.round(node.scrollLeft / step);
      const relativeIndex = Math.min(Math.max(0, items.length - 1), rawIndex % Math.max(1, items.length));
      setPosition({
        index: relativeIndex,
        start: node.scrollLeft <= 2,
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
    if (items.length <= 2) return undefined;
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
        const halfWidth = node.scrollWidth / 2;
        if (halfWidth > node.clientWidth) {
          if (node.scrollLeft >= halfWidth) {
            node.scrollLeft -= halfWidth;
          } else if (node.scrollLeft <= 0) {
            node.scrollLeft += halfWidth;
          }
          node.scrollLeft += (dt / 1000) * 18;
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
                disabled={direction < 0 ? position.start : false}
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
        {items.map((child) => (
          <div className="review-carousel__item" key={child.key}>
            {child}
          </div>
        ))}
        {items.length > 2 && items.map((child, i) => (
          <div className="review-carousel__item" key={`${child.key || i}-dup`} aria-hidden="true">
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
