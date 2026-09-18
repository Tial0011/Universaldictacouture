import { useCallback, useEffect, useState } from "react";
import { fetchPublishedProducts } from "../services/products";

/**
 * The published catalogue, fetched once per page load and shared by
 * every screen that needs it (Homepage New In, Shop grid, discovery
 * fallbacks). Moving between Home and Shop therefore costs no extra
 * reads.
 */
let cache = null;

export function invalidateCatalogue() {
  cache = null;
}

function load() {
  if (!cache) {
    cache = fetchPublishedProducts().catch((error) => {
      cache = null; // let a retry try again
      throw error;
    });
  }
  return cache;
}

export function useCatalogue() {
  const [state, setState] = useState({ products: [], isLoading: true, error: null });

  const run = useCallback((isActive) => {
    setState((previous) => ({ ...previous, isLoading: true, error: null }));
    load().then(
      (products) => {
        if (isActive()) setState({ products, isLoading: false, error: null });
      },
      (error) => {
        if (isActive()) {
          setState({
            products: [],
            isLoading: false,
            error: error?.message || "The collection could not be loaded.",
          });
        }
      }
    );
  }, []);

  useEffect(() => {
    let active = true;
    run(() => active);
    return () => {
      active = false;
    };
  }, [run]);

  const retry = useCallback(() => {
    invalidateCatalogue();
    let active = true;
    run(() => active);
  }, [run]);

  return { ...state, retry };
}
