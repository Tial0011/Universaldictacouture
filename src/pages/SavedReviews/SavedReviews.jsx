import { useEffect, useMemo, useState } from "react";
import ReviewCard from "../../components/reviews/ReviewCard";
import { useReviewInteractions } from "../../components/reviews/useReviewInteractions";
import Button from "../../components/common/Button";
import PageIntro from "../../components/common/PageIntro";
import { useSavedReviews } from "../../context/SavedReviewsContext";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import { fetchPublishedReviews } from "../../services/content";
import { fetchPublishedProducts } from "../../services/products";
import "./SavedReviews.css";

export default function SavedReviews() {
  useDocumentMeta({ title: "Saved Reviews | Universal Dicta Couture", noindex: true });
  const { savedReviewIds, isPersistent, isReady, error: saveError, retrySync } = useSavedReviews();
  const { isLiked, toggleLike, isReviewSaved, toggleSavedReview, shareReview, piecesReady, piecesError } = useReviewInteractions();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ reviews: [], products: [], loading: true, error: "" });
  const hasSavedReviews = savedReviewIds.length > 0;

  useEffect(() => {
    if (!isReady || !hasSavedReviews) return;
    let active = true;
    Promise.all([fetchPublishedReviews(null, true), fetchPublishedProducts().catch(() => [])])
      .then(([reviews, products]) => {
        if (active) setState({ reviews, products, loading: false, error: "" });
      })
      .catch(() => {
        if (active) setState({ reviews: [], products: [], loading: false, error: "Saved reviews could not be loaded. Please try again." });
      });
    return () => { active = false; };
  }, [isReady, attempt, hasSavedReviews]);

  const productMap = useMemo(() => new Map(state.products.map((product) => [product.id, product])), [state.products]);
  const reviewMap = useMemo(() => new Map(state.reviews.map((review) => [review.id, review])), [state.reviews]);
  const saved = savedReviewIds.map((id) => reviewMap.get(id)).filter(Boolean);
  const unavailableCount = state.loading ? 0 : savedReviewIds.length - saved.length;

  return <>
    <PageIntro eyebrow="My Closet" title="Saved Reviews" description={isPersistent ? "Customer stories you bookmarked, ready to revisit." : "Customer stories you bookmark are kept in this browser."} />
    <section className="container section saved-reviews" aria-label="Bookmarked customer reviews">
      {piecesError && <p role="alert">{piecesError}</p>}
      {saveError && <div role="status"><p>{saveError}</p>{isPersistent && <Button variant="secondary" onClick={retrySync}>Retry account sync</Button>}</div>}
      {!isReady && saveError ? null : !isReady || (hasSavedReviews && state.loading)
        ? <p role="status">Loading your saved reviews…</p>
        : !hasSavedReviews
          ? <p>No reviews saved yet. Bookmark a customer story to see it here.</p>
          : state.error
            ? <div role="alert"><p>{state.error}</p><Button onClick={() => { setState((previous) => ({ ...previous, loading: true, error: "" })); setAttempt((value) => value + 1); }}>Try again</Button></div>
            : <>
              {unavailableCount > 0 && <p>{unavailableCount} saved {unavailableCount === 1 ? "review is" : "reviews are"} no longer published.</p>}
              {saved.length > 0 ? <div className="saved-reviews__grid">
                {saved.map((entry) => {
                  const product = productMap.get(entry.productId) || null;
                  return <ReviewCard
                    key={entry.id}
                    entry={entry}
                    product={product}
                    showDate
                    liked={isLiked(entry.id, product)}
                    saved={isReviewSaved(entry.id)}
                    likeReady={!product || piecesReady}
                    onLike={() => toggleLike(entry.id, product)}
                    onSave={() => toggleSavedReview(entry.id)}
                    onShare={shareReview}
                  />;
                })}
              </div> : <p>No published reviews are available from your bookmarks right now.</p>}
            </>}
      <div className="account-actions">
        <Button to="/reviews-feeds">Browse reviews</Button>
        <Button to="/my-closet/my-pieces" variant="secondary">My Pieces</Button>
        <Button to="/my-closet" variant="secondary">My Closet</Button>
      </div>
    </section>
  </>;
}
