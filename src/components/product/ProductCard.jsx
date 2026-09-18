import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ProductImage from "./ProductImage";
import { useSavedPieces } from "../../context/SavedPiecesContext";
import { ADD_RESULT, useCloset } from "../../context/ClosetContext";
import { useToast } from "../../context/ToastContext";
import { resolveSelections } from "../../services/productModel";
import { formatNaira } from "../../utils/formatters";
import "./ProductCard.css";

function HeartIcon({ filled }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20.8 8.8c0 5-8.8 10-8.8 10s-8.8-5-8.8-10A4.8 4.8 0 0 1 12 5.9a4.8 4.8 0 0 1 8.8 2.9Z" />
    </svg>
  );
}

function ProductPrice({ product }) {
  const price = formatNaira(product.minPrice);
  const unit = product.unitLabel ? ` ${product.unitLabel}` : "";

  if (product.hasVariablePricing) {
    return (
      <p className="product-card__price">
        <span className="visually-hidden">Price from </span>
        <span aria-hidden="true">From </span>
        {price}
        {unit}
      </p>
    );
  }

  return (
    <p className="product-card__price">
      {price}
      {unit}
    </p>
  );
}

export default function ProductCard({ product, imageLoading = "lazy" }) {
  const { isSaved, toggleSaved, isPersistent } = useSavedPieces();
  const { addToCloset } = useCloset();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [isAdding, setIsAdding] = useState(false);

  const saved = isSaved(product.id);
  const { isComplete } = resolveSelections(product);

  const handleSave = () => {
    const nowSaved = toggleSaved(product.id);
    showToast(
      nowSaved
        ? isPersistent
          ? "Saved to your Saved Pieces."
          : "Saved for this visit. Create a Profile to keep your Saved Pieces."
        : "Removed from your Saved Pieces."
    );
  };

  const handleAddToCloset = async () => {
    // Required choices are made on Product Details, so the visitor is
    // taken there instead of a line being created without them.
    if (!isComplete) {
      navigate(`${product.href}?choose=1`);
      return;
    }

    setIsAdding(true);
    try {
      const result = await addToCloset(product);
      if (result.status === ADD_RESULT.ADDED) {
        showToast("Piece added to your Closet.");
      } else if (result.status === ADD_RESULT.NEEDS_SELECTION) {
        navigate(`${product.href}?choose=1`);
      } else if (result.status === ADD_RESULT.UNAVAILABLE) {
        showToast("This piece is no longer available.", "error");
      } else {
        showToast("This piece could not be added right now. Please try again.", "error");
      }
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <article className="product-card">
      <div className="product-card__media">
        <Link to={product.href} className="product-card__media-link" tabIndex={-1} aria-hidden="true">
          <ProductImage
            image={product.image}
            alt={product.name}
            loading={imageLoading}
            sizes="(min-width: 1280px) 20vw, (min-width: 768px) 30vw, 45vw"
          />
        </Link>
        <button
          type="button"
          className={`product-card__save${saved ? " is-saved" : ""}`}
          onClick={handleSave}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${product.name} from Saved Pieces` : `Save ${product.name} to Saved Pieces`}
        >
          <HeartIcon filled={saved} />
        </button>
      </div>

      <div className="product-card__body">
        <h3 className="product-card__name">
          <Link to={product.href}>{product.name}</Link>
        </h3>
        <ProductPrice product={product} />
        <button
          type="button"
          className="product-card__closet"
          onClick={handleAddToCloset}
          disabled={isAdding}
          aria-busy={isAdding || undefined}
        >
          Add to Closet
        </button>
      </div>
    </article>
  );
}
