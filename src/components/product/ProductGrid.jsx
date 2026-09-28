import ProductCard from "./ProductCard";

export default function ProductGrid({
  products,
  label = "Products",
  view = "grid",
  eagerCount = 4,
  variant = "default",
  navigationState,
  onProductNavigate,
}) {
  return (
    <ul className={`product-grid${view === "list" ? " product-grid--list" : ""}`} aria-label={label}>
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductCard
            product={product}
            view={view}
            variant={variant}
            navigationState={navigationState}
            onNavigate={onProductNavigate}
            imageLoading={index < eagerCount ? "eager" : "lazy"}
          />
        </li>
      ))}
    </ul>
  );
}
