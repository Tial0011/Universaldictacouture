import ProductCard from "./ProductCard";

export default function ProductGrid({
  products,
  label = "Products",
  view = "grid",
  eagerCount,
  variant = "default",
  navigationState,
  onProductNavigate,
}) {
  // Keep eager loading deliberately small on the Shop. Native lazy loading
  // can still fetch near-viewport cards without preloading whole batches.
  const resolvedEagerCount = Number.isInteger(eagerCount)
    ? Math.max(0, eagerCount)
    : variant === "shop"
      ? 2
      : 4;

  return (
    <ul className={`product-grid${view === "list" ? " product-grid--list" : ""}`} aria-label={label}>
      {products.map((product, index) => (
        <li key={product.id} data-product-id={product.id}>
          <ProductCard
            product={product}
            view={view}
            variant={variant}
            navigationState={navigationState}
            onNavigate={onProductNavigate}
            imageLoading={index < resolvedEagerCount ? "eager" : "lazy"}
            imageFetchPriority={index === 0 ? "high" : "auto"}
          />
        </li>
      ))}
    </ul>
  );
}
