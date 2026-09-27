import { Link } from "react-router-dom";
import Button from "../common/Button";
import ReviewCard from "../reviews/ReviewCard";
import ReviewGrid from "../reviews/ReviewGrid";
import { useReviewInteractions } from "../reviews/useReviewInteractions";
import "./ReviewsPreview.css";

export default function ReviewsPreview({ entries = [], products = [], isLoading = false, error = "", onRetry }) {
  const { isLiked, toggleLike, isReviewSaved, toggleSavedReview, shareReview, piecesReady, reviewsReady, piecesError, reviewsError, retryReviewSync } = useReviewInteractions();
  const productMap = new Map(products.map(product => [product.id, product]));
  const preview = entries.slice(0, 6);
  return <section className="review-showcase" aria-labelledby="home-reviews">
    <div className="container review-showcase__inner">
      <header className="review-showcase__header">
        <div><span className="review-showcase__eyebrow">The customer edit · Universal Dicta Couture</span><h2 id="home-reviews">Reviews <em>&amp; Feeds</em></h2><p>Woven with meaning. Worn your way.<br />Personal stories from the people who bring our pieces to life.</p></div>
        <Link className="review-showcase__view-all" to="/reviews-feeds">Explore all stories <span aria-hidden="true">↗</span></Link>
      </header>
      <div className="review-showcase__woven-rule" aria-hidden="true"><span>UDC</span></div>
      {piecesError && <p role="alert">{piecesError}</p>}
      {reviewsError && <div role="status"><p>{reviewsError}</p>{retryReviewSync && <Button variant="secondary" onClick={retryReviewSync}>Retry account sync</Button>}</div>}
      {isLoading ? <div className="review-showcase__state" role="status">Gathering customer stories…</div>
        : error ? <div className="review-showcase__state" role="alert"><h3>Customer stories are taking a moment.</h3><p>{error}</p>{onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}</div>
        : !entries.length ? <div className="review-showcase__state"><h3>The story wall is ready.</h3><p>Published customer reviews will appear here.</p></div>
        : <ReviewGrid>{preview.map(entry => {
          const product = productMap.get(entry.productId) || null;
          return <ReviewCard key={entry.id} entry={entry} product={product} variant="home" showDate
            liked={isLiked(entry.id, product)} saved={isReviewSaved(entry.id)}
            likeReady={!product || piecesReady} saveReady={reviewsReady}
            onLike={() => toggleLike(entry.id, product)} onSave={() => toggleSavedReview(entry.id)} onShare={shareReview} />;
        })}</ReviewGrid>}
      {entries.length > 6 && <div className="review-showcase__footer"><Button to="/reviews-feeds" variant="secondary">View all customer stories</Button></div>}
    </div>
  </section>;
}
