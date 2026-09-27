import Button from "../common/Button";
import ReviewCard from "../reviews/ReviewCard";
import ReviewCarousel from "../reviews/ReviewCarousel";
import { useReviewInteractions } from "../reviews/useReviewInteractions";
import "./ReviewsPreview.css";

export default function ReviewsPreview({ entries = [], products = [], isLoading = false, error = "", onRetry }) {
  const { isLiked, toggleLike, isReviewSaved, toggleSavedReview, shareReview, piecesReady, reviewsReady } = useReviewInteractions();
  const productMap = new Map(products.map(product => [product.id, product]));
  const preview = entries.slice(0, 20);
  return <section className="review-showcase" aria-labelledby="home-reviews">
    <div className="container review-showcase__inner">
      {isLoading ? <div className="review-showcase__state" role="status">Gathering customer stories…</div>
        : error ? <div className="review-showcase__state" role="alert"><h3>Customer stories are taking a moment.</h3><p>{error}</p>{onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}</div>
        : !entries.length ? <div className="review-showcase__state"><h3>The story wall is ready.</h3><p>Published customer reviews will appear here.</p></div>
        : <ReviewCarousel title="Review & Feeds" headingId="home-reviews" description={`Latest ${preview.length} ${preview.length === 1 ? "review" : "reviews"} from our amazing customers`} viewAll>{preview.map(entry => {
          const product = productMap.get(entry.productId) || null;
          return <ReviewCard key={entry.id} entry={entry} product={product} variant="home" showDate
            liked={isLiked(entry.id, product)} saved={isReviewSaved(entry.id)}
            likeReady={!product || piecesReady} saveReady={reviewsReady}
            onLike={() => toggleLike(entry.id, product)} onSave={() => toggleSavedReview(entry.id)} onShare={shareReview} />;
        })}</ReviewCarousel>}
    </div>
  </section>;
}
