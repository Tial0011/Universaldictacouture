import { useState } from "react";
import { useSavedReviews } from "../../context/SavedReviewsContext";
import { useSavedPieces } from "../../context/SavedPiecesContext";
import { useToast } from "../../context/ToastContext";
import { truncateText } from "../../utils/formatters";

const LIKED_KEY = "udc:review-likes:session";

function readLikedIds() {
  try {
    const ids = JSON.parse(sessionStorage.getItem(LIKED_KEY) || "[]");
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeLikedIds(ids) {
  try { sessionStorage.setItem(LIKED_KEY, JSON.stringify(ids)); } catch { /* memory-only fallback */ }
}

export function useReviewInteractions() {
  const [likedIds, setLikedIds] = useState(readLikedIds);
  const { isSaved, toggleSaved, isPersistent: piecesPersistent, error: piecesError, isReady: piecesReady } = useSavedPieces();
  const { isReviewSaved, toggleSavedReview, isPersistent: reviewsPersistent, error: reviewsError, isReady: reviewsReady } = useSavedReviews();
  const { showToast } = useToast();

  function toggleLike(reviewId, product) {
    if (product?.id) {
      if (!piecesReady) return;
      const added = toggleSaved(product.id);
      showToast(added
        ? piecesPersistent ? "Piece liked and saved in My Closet → My Pieces." : "Piece liked for this visit in My Closet → My Pieces."
        : "Piece removed from My Pieces.");
      return;
    }
    setLikedIds((current) => {
      const next = current.includes(reviewId)
        ? current.filter((id) => id !== reviewId)
        : [...current, reviewId];
      writeLikedIds(next);
      return next;
    });
    showToast(likedIds.includes(reviewId) ? "Review unliked." : "Review liked for this visit.");
  }

  async function saveReview(reviewId) {
    if (!reviewsReady) return;
    const added = await toggleSavedReview(reviewId);
    if (added === null) {
      showToast("Bookmark change could not be stored. Check your connection and try again.", "error");
      return;
    }
    showToast(added
      ? reviewsPersistent ? "Review saved in My Closet → Saved Reviews." : "Review saved in this browser under My Closet → Saved Reviews."
      : "Review removed from Saved Reviews.");
  }

  async function shareReview(entry, product) {
    const target = `/reviews-feeds?review=${encodeURIComponent(entry.id)}`;
    const url = new URL(target, window.location.origin).toString();
    const text = `${truncateText(entry.body, 180)}${product?.name ? ` — ${product.name}` : ""}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Review & Feeds — ${product?.name || "Universal Dicta Couture"}`, text, url });
        return "shared";
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        return "copied";
      }
      window.prompt("Copy this review and link", `${text}\n${url}`);
      return "prompt";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
      window.prompt("Copy this review and link", `${text}\n${url}`);
      return "prompt";
    }
  }

  return {
    isLiked: (id, product) => product?.id ? isSaved(product.id) : likedIds.includes(id),
    toggleLike,
    isReviewSaved,
    toggleSavedReview: saveReview,
    shareReview,
    piecesReady,
    reviewsReady,
    piecesError,
    reviewsError,
  };
}
