import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCloset } from "../../context/ClosetContext";
import { useSavedPieces } from "../../context/SavedPiecesContext";
import { useSavedReviews } from "../../context/SavedReviewsContext";
import ProductImage from "../../components/product/ProductImage";
import Button from "../../components/common/Button";
import { formatNaira, truncateText } from "../../utils/formatters";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import { closetEnquiry } from "../../services/chatModel";
import { fetchPublishedReviews } from "../../services/content";
import "../Profile/Profile.css";
import "./SavedReviewPreview.css";

export default function MyCloset() {
  useDocumentMeta({ title: "My Closet | Universal Dicta Couture", noindex: true });
  const { lines, removeFromCloset } = useCloset();
  const { savedIds } = useSavedPieces();
  const { savedReviewIds, toggleSavedReview, isReady, error: saveError } = useSavedReviews();
  const [attempt, setAttempt] = useState(0);
  const [reviewState, setReviewState] = useState({ entries: [], loading: true, error: "" });
  const hasSavedReviews = savedReviewIds.length > 0;

  useEffect(() => {
    if (!isReady || !hasSavedReviews) return;
    let active = true;
    fetchPublishedReviews(null, true)
      .then((entries) => {
        if (active) setReviewState({ entries, loading: false, error: "" });
      })
      .catch(() => {
        if (active) setReviewState({ entries: [], loading: false, error: "Saved reviews could not be loaded. Please try again." });
      });
    return () => { active = false; };
  }, [isReady, hasSavedReviews, attempt]);

  const reviewMap = useMemo(() => new Map(reviewState.entries.map((entry) => [entry.id, entry])), [reviewState.entries]);
  const savedReviews = savedReviewIds.map((id) => reviewMap.get(id)).filter(Boolean);

  return <section className="account-page container"><div className="account-card">
    <h1>My Closet</h1>
    <p>Keep track of pieces you love and customer stories you want to revisit. Adding a piece to your closet does not place an order or make a payment.</p>

    <section className="closet-section" aria-labelledby="closet-selected-heading">
      <h2 id="closet-selected-heading">Selected pieces</h2>
      {lines.length ? <ul className="customer-list">{lines.map((line) => <li className="customer-piece" key={line.key}>
        <ProductImage image={line.image} alt={line.name} />
        <div><h3><Link to={`/shop/${encodeURIComponent(line.slug || line.productId)}`}>{line.name}</Link></h3><p>{formatNaira(line.price)} · Quantity: {line.quantity}</p><p>{Object.entries(line.selections || {}).map(([key, value]) => `${key}: ${value}`).join(" · ")}</p><Button variant="ghost" onClick={() => removeFromCloset(line.key)}>Remove {line.name}</Button></div>
      </li>)}</ul> : <p>No pieces added yet. Browse the shop to find one you love.</p>}
      {lines.length > 0 && <Button to="/chats" state={{ draft: closetEnquiry(lines) }} variant="secondary">Ask about these pieces</Button>}
    </section>

    <section className="closet-section" aria-labelledby="closet-saved-reviews-heading">
      <div className="closet-section__heading"><h2 id="closet-saved-reviews-heading">Saved reviews{savedReviewIds.length ? ` (${savedReviewIds.length})` : ""}</h2><Link to="/my-closet/saved-reviews">View all</Link></div>
      {saveError && <p role="alert">{saveError}</p>}
      {!isReady && saveError ? null : !isReady || (hasSavedReviews && reviewState.loading)
        ? <p role="status">Loading your saved reviews…</p>
        : !hasSavedReviews
          ? <p>No reviews saved yet. Bookmark one from Review &amp; Feeds to see it here.</p>
          : reviewState.error
            ? <div role="alert"><p>{reviewState.error}</p><Button variant="secondary" onClick={() => { setReviewState((previous) => ({ ...previous, loading: true, error: "" })); setAttempt((value) => value + 1); }}>Try again</Button></div>
            : <>
              {savedReviews.length ? <ul className="closet-saved-reviews">{savedReviews.slice(0, 3).map((entry) => <li key={entry.id}>
                <strong>{entry.author || "Customer review"}</strong>
                <p>{truncateText(entry.body, 130)}</p>
                {entry.productSnapshot?.name && <small>Reviewed piece: {entry.productSnapshot.name}</small>}
                <div className="closet-saved-reviews__actions"><Link to={`/reviews-feeds?review=${encodeURIComponent(entry.id)}`}>Read review</Link><button type="button" onClick={() => toggleSavedReview(entry.id)}>Remove bookmark</button></div>
              </li>)}</ul> : <p>Your bookmarked reviews are no longer published.</p>}
              {savedReviews.length < savedReviewIds.length && <p>{savedReviewIds.length - savedReviews.length} saved {savedReviewIds.length - savedReviews.length === 1 ? "review is" : "reviews are"} no longer published.</p>}
            </>}
    </section>

    <div className="account-actions"><Button to="/shop">Browse the shop</Button><Button to="/my-closet/my-pieces" variant="secondary">My Pieces{savedIds.length ? ` (${savedIds.length})` : ""}</Button><Button to="/my-closet/saved-reviews" variant="secondary">Saved Reviews{savedReviewIds.length ? ` (${savedReviewIds.length})` : ""}</Button></div>
  </div></section>;
}
