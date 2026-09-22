import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { closetLineKey, priceForSelections, resolveSelections } from "../services/productModel";
import { useAuth } from "./AuthContext";
import { revalidateProduct } from "../services/products";

/**
 * My Closet.
 *
 * A Closet line is only ever created from a freshly re-read product
 * document, so a piece that was unpublished, repriced or given new
 * required options since the grid rendered cannot slip in at a stale
 * price. Lines are keyed by product + resolved options: the same
 * options increment quantity, different options open a new line.
 *
 * The guest Closet lives in sessionStorage and survives navigation and
 * refresh for the current session. Account migration and order review
 * belong to later phases.
 */

const STORAGE_KEY = "udc:closet";

export const ADD_RESULT = {
  ADDED: "added",
  NEEDS_SELECTION: "needs-selection",
  UNAVAILABLE: "unavailable",
  ERROR: "error",
};

const ClosetContext = createContext({
  lines: [],
  itemCount: 0,
  addToCloset: async () => ({ status: ADD_RESULT.ERROR }),
});

function readSession(storageKey) {
  try {
    const raw = sessionStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function ClosetProvider({ children }) {
  const { user } = useAuth();
  return <ClosetSession key={user?.uid || "guest"} storageKey={STORAGE_KEY + ":" + (user?.uid || "guest")} >{children}</ClosetSession>;
}

function ClosetSession({ children, storageKey }) {
  const [lines, setLines] = useState(() => readSession(storageKey));

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(lines));
    } catch {
      // Closet then lives in memory only for this page.
    }
  }, [lines, storageKey]);

  const addToCloset = useCallback(async (product, selections = {}) => {
    if (!product?.id) return { status: ADD_RESULT.ERROR };

    // Missing required choices are resolved on Product Details, never
    // guessed here — an incomplete Closet line must not exist.
    const local = resolveSelections(product, selections);
    if (!local.isComplete) {
      return { status: ADD_RESULT.NEEDS_SELECTION, missing: local.missing };
    }

    let authoritative;
    try {
      authoritative = await revalidateProduct(product.id);
    } catch {
      return { status: ADD_RESULT.ERROR };
    }

    if (!authoritative) return { status: ADD_RESULT.UNAVAILABLE };

    const revalidated = resolveSelections(authoritative, local.resolved);
    if (!revalidated.isComplete) {
      return { status: ADD_RESULT.NEEDS_SELECTION, missing: revalidated.missing };
    }

    const price = priceForSelections(authoritative, revalidated.resolved);
    const key = closetLineKey(authoritative.id, revalidated.resolved);

    setLines((previous) => {
      const existing = previous.find((line) => line.key === key);
      if (existing) {
        return previous.map((line) =>
          line.key === key ? { ...line, quantity: line.quantity + 1, price } : line
        );
      }
      return [
        ...previous,
        {
          key,
          productId: authoritative.id,
          slug: authoritative.slug,
          name: authoritative.name,
          image: authoritative.image,
          selections: revalidated.resolved,
          price,
          quantity: 1,
        },
      ];
    });

    return { status: ADD_RESULT.ADDED, product: authoritative };
  }, []);

  const value = useMemo(
    () => ({
      lines,
      itemCount: lines.reduce((total, line) => total + line.quantity, 0),
      addToCloset,
      removeFromCloset: key => setLines(previous => previous.filter(line => line.key !== key)),
    }),
    [lines, addToCloset]
  );

  return <ClosetContext.Provider value={value}>{children}</ClosetContext.Provider>;
}

export function useCloset() {
  return useContext(ClosetContext);
}
