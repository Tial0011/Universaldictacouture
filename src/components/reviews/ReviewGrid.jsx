import { Children, useLayoutEffect, useRef } from "react";
import "./ReviewGrid.css";

/** Row-major masonry keeps reading order and reflows when photos or text resize. */
export default function ReviewGrid({ children, className = "" }) {
  const gridRef = useRef(null);
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") return;
    let frame;
    const measure = () => {
      const gap = parseFloat(getComputedStyle(grid).rowGap) || 0;
      for (const item of grid.children) {
        const height = item.firstElementChild?.getBoundingClientRect().height || 0;
        item.style.gridRowEnd = `span ${Math.max(1, Math.ceil((height + gap) / (4 + gap)))}`;
      }
      grid.dataset.masonry = "true";
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    for (const item of grid.children) if (item.firstElementChild) observer.observe(item.firstElementChild);
    observer.observe(grid);
    measure();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [children]);
  return <div className={`review-grid ${className}`} ref={gridRef}>
    {Children.map(children, child => child && <div className="review-grid__item">{child}</div>)}
  </div>;
}
