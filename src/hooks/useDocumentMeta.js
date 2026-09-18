import { useEffect } from "react";

/**
 * Title, meta description, canonical and robots handling for a route.
 *
 * Shop filter/search/sort combinations point their canonical at the
 * clean /shop URL and are marked noindex, so refinements never become
 * duplicate indexable pages.
 */
export function useDocumentMeta({ title, description, canonicalPath, noindex = false }) {
  useEffect(() => {
    if (title) document.title = title;

    const ensure = (selector, create) => {
      let element = document.head.querySelector(selector);
      if (!element) {
        element = create();
        document.head.appendChild(element);
      }
      return element;
    };

    if (description) {
      const meta = ensure('meta[name="description"]', () => {
        const element = document.createElement("meta");
        element.setAttribute("name", "description");
        return element;
      });
      meta.setAttribute("content", description);
    }

    if (canonicalPath) {
      const link = ensure('link[rel="canonical"]', () => {
        const element = document.createElement("link");
        element.setAttribute("rel", "canonical");
        return element;
      });
      link.setAttribute("href", new URL(canonicalPath, window.location.origin).toString());
    }

    const robots = document.head.querySelector('meta[name="robots"]');
    if (noindex) {
      const meta =
        robots ||
        ensure('meta[name="robots"]', () => {
          const element = document.createElement("meta");
          element.setAttribute("name", "robots");
          return element;
        });
      meta.setAttribute("content", "noindex,follow");
    } else if (robots) {
      robots.remove();
    }
  }, [title, description, canonicalPath, noindex]);
}
