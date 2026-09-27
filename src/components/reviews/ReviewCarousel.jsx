import { Children, useId, useLayoutEffect, useRef, useState } from "react";
import ViewAllLink from "../common/ViewAllLink";
import "../discovery/DiscoveryModule.css";
import "../discovery/HomeDiscovery.css";
import "./ReviewCarousel.css";

export default function ReviewCarousel({ children, title, headingId, description, viewAll = false }) {
  const track = useRef(null);
  const trackId = useId();
  const items = Children.toArray(children);
  const [position, setPosition] = useState({ index: 0, start: true, end: true });
  useLayoutEffect(() => {
    const node = track.current;
    const measure = () => {
      const first = node.firstElementChild;
      const step = first ? first.getBoundingClientRect().width + (parseFloat(getComputedStyle(node).gap) || 0) : 1;
      setPosition({ index: Math.min(Math.max(0, items.length - 1), Math.round(node.scrollLeft / step)), start: node.scrollLeft <= 2, end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 2 });
    };
    measure();
    node.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => { node.removeEventListener("scroll", measure); observer.disconnect(); };
  }, [items.length]);
  const move = (direction) => {
    const node = track.current;
    const step = node.firstElementChild.getBoundingClientRect().width + (parseFloat(getComputedStyle(node).gap) || 0);
    node.scrollBy({ left: step * direction, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  return <div className="review-carousel discovery--home">
    <header className="discovery__head">
      {title && <h2 className="discovery__title" id={headingId}>{title === "Review & Feeds" ? <><span className="discovery__title-prefix">Review</span><span className="discovery__title-accent">&amp; Feeds</span></> : title}</h2>}
      <div className="discovery__head-actions">
        <div className="discovery__group-arrows" role="group" aria-label="Review navigation">
          {[-1, 1].map(direction => <button key={direction} className={`discovery__group-arrow discovery__group-arrow--${direction < 0 ? "previous" : "next"}`} type="button" aria-label={direction < 0 ? "Previous review" : "Next review"} aria-controls={trackId} disabled={direction < 0 ? position.start : position.end} onClick={() => move(direction)}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={direction < 0 ? "M12.5 15L7.5 10L12.5 5" : "M7.5 5L12.5 10L7.5 15"} /></svg>
          </button>)}
        </div>
        {viewAll && <ViewAllLink to="/reviews-feeds" className="discovery__view-all" />}
      </div>
    </header>
    {description && <p className="review-carousel__description">{description}</p>}
    <div className="discovery__chapter">
      <div className="discovery__chapter-track" aria-hidden="true">{items.map((item, index) => <span key={item.key} className={index === position.index ? "is-current" : undefined} />)}</div>
      <span className="discovery__position" aria-live="polite" aria-atomic="true">{String(items.length ? position.index + 1 : 0).padStart(2, "0")}<span> / {String(items.length).padStart(2, "0")}</span></span>
    </div>
    <div className="review-carousel__track" id={trackId} ref={track} tabIndex={items.length ? 0 : -1} aria-label="Customer reviews — scroll to browse">
      {items.map(child => <div className="review-carousel__item" key={child.key}>{child}</div>)}
    </div>
  </div>;
}
