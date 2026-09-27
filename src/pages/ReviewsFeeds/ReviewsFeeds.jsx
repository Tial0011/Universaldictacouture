import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ReviewCard from "../../components/reviews/ReviewCard";
import ReviewGrid from "../../components/reviews/ReviewGrid";
import { useReviewInteractions } from "../../components/reviews/useReviewInteractions";
import Button from "../../components/common/Button";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import { fetchPublishedReviews } from "../../services/content";
import { fetchPublishedProducts } from "../../services/products";
import { reviewPublishedTime, reviewSubmittedTime } from "../../services/reviewModel";
import "./ReviewsFeeds.css";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "photos", label: "Photos" },
  { id: "written", label: "Written" },
  { id: "service", label: "Customer Service" },
  { id: "quality", label: "Product Quality" },
];

function searchText(review, product) {
  return [review.author, review.body, product?.name, review.productSnapshot?.name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function ReviewsFeeds() {
  useDocumentMeta({
    title: "Review & Feeds | Universal Dicta Couture",
    description: "Real customer moments, honest feedback and the Universal Dicta Couture pieces they made their own.",
    canonicalPath: "/reviews-feeds",
  });

  const [params] = useSearchParams();
  const focusId = params.get("review") || "";
  const [state, setState] = useState({ entries: [], products: [], loading: true, error: "" });
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const { isLiked, toggleLike, isReviewSaved, toggleSavedReview, shareReview, piecesReady, reviewsReady, piecesError, reviewsError, retryReviewSync } = useReviewInteractions();

  useEffect(() => {
    let active = true;
    setState((previous) => ({ ...previous, loading: true, error: "" }));
    Promise.all([fetchPublishedReviews(null, true), fetchPublishedProducts().catch(() => [])])
      .then(([entries, products]) => {
        if (active) setState({ entries, products, loading: false, error: "" });
      })
      .catch(() => {
        if (active) setState({ entries: [], products: [], loading: false, error: "Reviews could not be loaded. Please try again." });
      });
    return () => { active = false; };
  }, [attempt]);

  const productMap = useMemo(() => new Map(state.products.map((product) => [product.id, product])), [state.products]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let reviews = state.entries.filter((entry) => {
      const product = productMap.get(entry.productId);
      if (filter === "photos" && !entry.image) return false;
      if (filter === "written" && entry.image) return false;
      if (needle && !searchText(entry, product).includes(needle)) return false;
      return true;
    });

    const activeSort = filter === "service" ? "service" : filter === "quality" ? "quality" : sort;
    reviews = [...reviews].sort((a, b) => {
      const newestDelta = reviewPublishedTime(b) - reviewPublishedTime(a) || reviewSubmittedTime(b) - reviewSubmittedTime(a);
      if (activeSort === "service") return (b.customerServiceRating || 0) - (a.customerServiceRating || 0) || newestDelta;
      if (activeSort === "quality") return (b.productQualityRating || 0) - (a.productQualityRating || 0) || newestDelta;
      if (activeSort === "oldest") return -newestDelta;
      return newestDelta;
    });
    return reviews;
  }, [filter, productMap, query, sort, state.entries]);

  useEffect(() => {
    if (!focusId || state.loading) return;
    const target = Array.from(document.querySelectorAll("[data-review-id]")).find((node) => node.dataset.reviewId === focusId);
    if (!target) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    target.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    target.focus({ preventScroll: true });
  }, [focusId, state.loading, visible.length]);

  return <main className="reviews-page">
    <section className="reviews-page__hero" aria-labelledby="reviews-page-title">
      <div className="reviews-page__hero-pattern" aria-hidden="true" />
      <div className="container reviews-page__hero-inner">
        <span className="reviews-page__eyebrow">Universal Dicta Couture · The customer edit</span>
        <div className="reviews-page__hero-copy">
          <h1 id="reviews-page-title">Reviews <em>&amp; Feeds</em></h1>
          <div><p>Woven with meaning.<br />Worn your way.</p><span className="reviews-page__lede">Real moments, personal style, and the pieces that become part of your story.</span></div>
        </div>
        <div className="reviews-page__hero-footer"><span>Tradition in every thread. You in every story.</span><Link to="/my-closet/saved-reviews">Your saved stories <span aria-hidden="true">↗</span></Link></div>
      </div>
    </section>

    <section className="container reviews-page__content" aria-label="Published customer reviews">
      <div className="reviews-page__toolbar">
        <div className="reviews-page__filters" aria-label="Review filters">
          {FILTERS.map((item) => <button key={item.id} type="button" className={filter === item.id ? "is-active" : ""} aria-pressed={filter === item.id} onClick={() => {
            setFilter(item.id);
            if (item.id === "service") setSort("service");
            else if (item.id === "quality") setSort("quality");
          }}>{item.label}</button>)}
        </div>
        <div className="reviews-page__tools">
          <label className="reviews-page__search">
            <span className="visually-hidden">Search reviews</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reviews and pieces…" />
          </label>
          <label className="reviews-page__sort">
            <span>Sort</span>
            <select aria-label="Sort reviews" value={sort} onChange={(event) => { setSort(event.target.value); if (["service", "quality"].includes(filter)) setFilter("all"); }}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="service">Customer Service</option>
              <option value="quality">Product Quality</option>
            </select>
          </label>
        </div>
      </div>

      <div className="reviews-page__summary">
        <p>{state.loading ? "Loading customer stories…" : `${visible.length} ${visible.length === 1 ? "story" : "stories"} shown`}</p>
        <span aria-hidden="true" />
      </div>
      {piecesError && <p role="alert">{piecesError}</p>}
      {reviewsError && <div role="status"><p>{reviewsError}</p>{retryReviewSync && <Button variant="secondary" onClick={retryReviewSync}>Retry account sync</Button>}</div>}

      {state.loading ? <div className="reviews-page__loading" role="status">Loading Review &amp; Feeds…</div>
      : state.error ? <div className="reviews-page__state" role="alert"><h2>Review &amp; Feeds is taking a moment.</h2><p>{state.error}</p><Button onClick={() => setAttempt((value) => value + 1)}>Try again</Button></div>
      : visible.length ? <ReviewGrid>
          {visible.map((entry) => <ReviewCard
            key={entry.id}
            entry={entry}
            product={productMap.get(entry.productId) || null}
            variant="feed"
            showDate
            forceExpanded={entry.id === focusId}
            liked={isLiked(entry.id, productMap.get(entry.productId))}
            saved={isReviewSaved(entry.id)}
            likeReady={!productMap.has(entry.productId) || piecesReady}
            saveReady={reviewsReady}
            onLike={() => toggleLike(entry.id, productMap.get(entry.productId))}
            onSave={() => toggleSavedReview(entry.id)}
            onShare={shareReview}
          />)}
        </ReviewGrid>
      : <div className="reviews-page__state"><h2>No matching stories</h2><p>Try another filter or search phrase.</p><button type="button" onClick={() => { setFilter("all"); setQuery(""); setSort("newest"); }}>Clear filters</button></div>}

      <div className="reviews-page__signature"><span aria-hidden="true">UDC</span><p>Stories worth keeping.<br /><em>Style that stays with you.</em></p><Link to="/shop">Discover the collection <span aria-hidden="true">→</span></Link></div>
    </section>
  </main>;
}
