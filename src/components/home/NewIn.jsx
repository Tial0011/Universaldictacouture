import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import NewInCard from "./NewInCard";
import LoadingSpinner from "../common/LoadingSpinner";
import ViewAllLink from "../common/ViewAllLink";
import PillTabs from "../common/PillTabs";

/**
 * New In. Products come only from published pieces the shop has
 * marked New In — when there are none, the section says so rather
 * than filling the grid. When the New In pieces span more than one
 * category, a small tab menu (real categories only — nothing
 * invented) lets the visitor narrow the six shown. Each piece is a
 * menu-style card (see NewInCard) ending in a View Piece button.
 */
export default function NewIn({
  products,
  isLoading,
  error,
  fallbackImage = null,
  viewAllTo = "/shop?newin=1",
}) {
  const [activeCategory, setActiveCategory] = useState("all");

  const categories = useMemo(() => {
    const seen = new Set();
    products.forEach((product) => product.category.forEach((value) => seen.add(value)));
    return Array.from(seen);
  }, [products]);

  const tabs = useMemo(
    () => [{ id: "all", label: "All" }, ...categories.map((value) => ({ id: value, label: value }))],
    [categories]
  );

  const visibleProducts = useMemo(() => {
    if (activeCategory === "all") return products;
    return products.filter((product) => product.category.includes(activeCategory));
  }, [products, activeCategory]);

  return (
    <section className="home-section container" aria-labelledby="home-new-in">
      <div className="home-section__head">
        <h2 id="home-new-in">New In</h2>
        <ViewAllLink to={viewAllTo} />
      </div>

      {!isLoading && !error && categories.length > 1 ? (
        <PillTabs
          tabs={tabs}
          activeId={activeCategory}
          onChange={setActiveCategory}
          label="Filter New In by category"
        />
      ) : null}

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
        <ul className="menu-grid" aria-label="New In">
          {visibleProducts.map((product, index) => (
            <li key={product.id}>
              <NewInCard
                product={product}
                fallbackImage={fallbackImage}
                imageLoading={index < 4 ? "eager" : "lazy"}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
