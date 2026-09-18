import { useEffect, useState } from "react";

/**
 * How many pieces to render before "Load More Pieces".
 * Mobile ~50, tablet ~100, desktop ~150 — enough to browse without
 * infinite scroll or numbered pagination.
 */
function resolveSize() {
  if (typeof window === "undefined") return 50;
  if (window.matchMedia("(min-width: 1024px)").matches) return 150;
  if (window.matchMedia("(min-width: 768px)").matches) return 100;
  return 50;
}

export function useBatchSize() {
  const [size, setSize] = useState(() => resolveSize());

  useEffect(() => {
    const tablet = window.matchMedia("(min-width: 768px)");
    const desktop = window.matchMedia("(min-width: 1024px)");

    const update = () => setSize(resolveSize());

    tablet.addEventListener("change", update);
    desktop.addEventListener("change", update);
    return () => {
      tablet.removeEventListener("change", update);
      desktop.removeEventListener("change", update);
    };
  }, []);

  return size;
}
