import ProductCard from "./ProductCard";

export default function ProductGrid({ products, label = "Products", eagerCount = 4 }) {
  return (
    <ul className="product-grid" aria-label={label}>
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductCard product={product} imageLoading={index < eagerCount ? "eager" : "lazy"} />
        </li>
      ))}
    </ul>
  );
}
