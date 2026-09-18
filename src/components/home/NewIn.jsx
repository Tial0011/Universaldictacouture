import { Link } from "react-router-dom";
import ProductGrid from "../product/ProductGrid";
import LoadingSpinner from "../common/LoadingSpinner";

/**
 * New In. Products come only from published pieces the shop has
 * marked New In — when there are none, the section says so rather
 * than filling the grid.
 */
export default function NewIn({ products, isLoading, error }) {
  return (
    <section className="home-section container" aria-labelledby="home-new-in">
      <div className="home-section__head">
        <h2 id="home-new-in">New In</h2>
        <Link className="home-section__more" to="/shop?newin=1">
          See everything new
        </Link>
      </div>

      {isLoading ? <LoadingSpinner label="Loading new pieces" /> : null}

      {!isLoading && error ? (
        <p className="home-section__note">
          New In could not be loaded right now. Please refresh to try again.
        </p>
      ) : null}

      {!isLoading && !error && products.length === 0 ? (
        <p className="home-section__note">
          No new pieces are published yet. <Link to="/shop">Browse the collection</Link> in the
          meantime.
        </p>
      ) : null}

      {!isLoading && !error && products.length > 0 ? (
        <ProductGrid products={products} label="New In" />
      ) : null}
    </section>
  );
}
