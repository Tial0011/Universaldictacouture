import { Children, useId, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
  return <div className="review-carousel">
    <header className="review-carousel__header">
      {title && <h2 id={headingId}>{title}</h2>}
      {description && <p>{description}</p>}
      <div className="review-carousel__controls">
        <button type="button" aria-label="Previous review" aria-controls={trackId} disabled={position.start} onClick={() => move(-1)}>‹</button>
        <button type="button" aria-label="Next review" aria-controls={trackId} disabled={position.end} onClick={() => move(1)}>›</button>
        <span aria-live="polite" aria-atomic="true">{String(items.length ? position.index + 1 : 0).padStart(2, "0")} / {String(items.length).padStart(2, "0")}</span>
        {viewAll && <Link to="/reviews-feeds">View all <span aria-hidden="true">→</span></Link>}
      </div>
    </header>
    <div className="review-carousel__track" id={trackId} ref={track} tabIndex={items.length ? 0 : -1} aria-label="Customer reviews — scroll to browse">
      {items.map(child => <div className="review-carousel__item" key={child.key}>{child}</div>)}
    </div>
  </div>;
}
