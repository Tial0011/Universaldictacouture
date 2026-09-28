import { useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useCatalogue } from "../../hooks/useCatalogue";
import { useCloset } from "../../context/ClosetContext";
import { useSavedPieces } from "../../context/SavedPiecesContext";
import { useAuth } from "../../context/AuthContext";
import { useAuthGate } from "../../context/AuthGateContext";
import ProductImage from "../../components/product/ProductImage";
import Button from "../../components/common/Button";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import { formatNaira } from "../../utils/formatters";
import { priceForSelections } from "../../services/productModel";
import { productChatContext } from "../../services/chatModel";
import { buildProductShare, shareContent } from "../../services/shareContent";
import "./ProductDetails.css";

export default function ProductDetails() {
  const { productId } = useParams();
  const location = useLocation();
  const requestedReturn = location.state?.shopReturn;
  const backToShop = typeof requestedReturn === "string" && (requestedReturn === "/shop" || requestedReturn.startsWith("/shop?"))
    ? requestedReturn
    : "/shop";
  const backState = location.state?.shopVisibleCount
    ? { restoreVisibleCount: location.state.shopVisibleCount }
    : undefined;
  const { products, isLoading, error, retry } = useCatalogue();
  const product = products.find((item) => item.slug === productId || item.id === productId);

  useDocumentMeta({
    title: product ? `${product.name} | Universal Dicta Couture` : "Piece details | Universal Dicta Couture",
    description: product
      ? `${product.name} from Universal Dicta Couture. View the piece, available options and current pricing.`
      : undefined,
    canonicalPath: `/shop/${encodeURIComponent(product?.slug || product?.id || productId)}`,
    noindex: !isLoading && !product,
  });

  if (isLoading) {
    return (
      <section className="section product-details" aria-busy="true">
        <div className="container product-details__state" role="status">
          <p className="product-details__eyebrow">Universal Dicta Couture</p>
          <h1>Loading your piece</h1>
          <p>Gathering the images and details.</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="section product-details">
        <div className="container product-details__state">
          <h1>Unable to load this piece</h1>
          <p role="alert">The collection could not be loaded. Please try again.</p>
          <div className="product-details__state-actions">
            <Button onClick={retry}>Try again</Button>
            <Button to={backToShop} state={backState} variant="ghost">Back to shop</Button>
          </div>
        </div>
      </section>
    );
  }

  if (!product) {
    return (
      <section className="section product-details">
        <div className="container product-details__state">
          <p className="product-details__eyebrow">The collection</p>
          <h1>Piece unavailable</h1>
          <p>This piece is no longer available. Explore the current collection to find your next piece.</p>
          <Button to={backToShop} state={backState}>Back to shop</Button>
        </div>
      </section>
    );
  }

  return <Piece key={product.id} product={product} backToShop={backToShop} backState={backState} />;
}

function Piece({ product, backToShop, backState }) {
  const { addToCloset } = useCloset();
  const { user } = useAuth();
  const { requestAuth } = useAuthGate();
  const location = useLocation();
  const { isSaved, toggleSaved, error: savedError } = useSavedPieces();
  const [selections, setSelections] = useState(() => Object.fromEntries(
    product.options.filter(option => option.required && option.values.length === 1)
      .map(option => [option.name, option.values[0]])
  ));
  const images = [product.image, ...product.images].filter((image, index, entries) =>
    image && entries.findIndex(entry => entry && (entry.publicId || entry.url) === (image.publicId || image.url)) === index
  );
  const [imageIndex, setImageIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const saved = isSaved(product.id);
  const details = [
    ["Category", product.category],
    ["Fabric", product.fabric],
    ["Colour", product.colour],
  ].filter(([, values]) => values?.length);

  async function handleAdd(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    setActionError("");
    try {
      const result = await addToCloset(product, selections);
      if (result.status === "added") {
        setMessage("Added to your closet.");
      } else if (result.status === "needs-selection") {
        setActionError("Choose all required options.");
      } else if (result.status === "unavailable") {
        setActionError("This piece is currently unavailable. Refresh to see the latest availability.");
      } else {
        setActionError("We couldn't add this piece to your closet. Please try again.");
      }
    } catch {
      setActionError("We couldn't add this piece to your closet. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleSave() {
    setActionError("");
    try {
      toggleSaved(product.id);
    } catch {
      setActionError("We couldn't update My Pieces. Please try again.");
    }
  }

  async function handleShare() {
    if (!user) {
      requestAuth({ returnTo: `${location.pathname}${location.search}` });
      return;
    }
    const result = await shareContent(buildProductShare(product, window.location.origin));
    if (result === "copied") setMessage("Product name, description and link copied, ready to share.");
  }

  return (
    <section className="section product-details" aria-labelledby="piece-title">
      <div className="container">
        <div className="product-details__back">
          <Button to={backToShop} state={backState} variant="ghost">Back to shop</Button>
        </div>
        <div className="product-details__layout">
          <div className="product-details__gallery">
            <div className="product-details__media">
              <ProductImage image={images[imageIndex]} alt={product.name} loading="eager" />
            </div>
            {images.length > 1 && <div className="product-details__thumbnails" role="group" aria-label="Product photographs">
              {images.map((image, index) => <button type="button" key={image.publicId || image.url} aria-label={`View photograph ${index + 1} of ${product.name}`} aria-pressed={imageIndex === index} onClick={() => setImageIndex(index)}>
                <ProductImage image={image} alt="" transformation="w_160,h_160,c_limit,q_auto,f_auto" />
              </button>)}
            </div>}
          </div>
          <div className="product-details__information">
            <div className="product-details__heading">
              <p className="product-details__eyebrow">Universal Dicta Couture</p>
              <h1 id="piece-title">{product.name}</h1>
              <div className="product-details__price-block" aria-live="polite" aria-atomic="true">
                <p className="product-details__price">
                  {formatNaira(product.mainPrice ?? product.price)}
                </p>
                {product.unitLabel && (
                  <p className="product-details__price-token">
                    {product.unitLabel}
                  </p>
                )}
              </div>
            </div>

            <form className="product-details__form" onSubmit={handleAdd} aria-busy={busy}>
              {product.options.length > 0 && (
                <fieldset className="product-details__options" disabled={busy}>
                  <legend>Choose your options</legend>
                  {product.options.map((option, index) => {
                    const fieldId = `piece-option-${index}`;
                    return (
                      <div className="product-details__field" key={option.id || option.name}>
                        <label htmlFor={fieldId}>
                          {option.name}
                          {option.required && <span>Required</span>}
                        </label>
                        <select
                          id={fieldId}
                          name={option.name}
                          required={option.required}
                          value={selections[option.name] || ""}
                          onChange={(event) => {
                            setSelections((current) => ({ ...current, [option.name]: event.target.value }));
                            setMessage("");
                            setActionError("");
                          }}
                        >
                          <option value="">Choose {option.name}</option>
                          {option.values.map((value) => <option key={value} value={value}>{value}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </fieldset>
              )}

              {product.description && <p className="product-details__description">{product.description}</p>}
              {details.length > 0 && (
                <dl className="product-details__attributes">
                  {details.map(([label, values]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{values.join(" · ")}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <div className="product-details__actions">
                <Button type="submit" isLoading={busy} disabled={busy}>Add to My Closet</Button>
                <Button variant="secondary" onClick={handleSave} aria-pressed={saved} disabled={busy}>
                  {saved ? "Saved piece" : "Save piece"}
                </Button>
                <Button to="/my-closet" variant="ghost">View My Closet</Button>
                <Button variant="ghost" onClick={handleShare}>Share this piece</Button>
                <Button to="/chats" state={{ draft: `Hello, I’m interested in ${product.name}.`, productContext: productChatContext(product) }} variant="ghost">Ask about this piece</Button>
              </div>
              <div className="product-details__feedback">
                {message && <p role="status">{message}</p>}
                {actionError && <p role="alert">{actionError}</p>}
                {savedError && <p role="alert">{savedError}</p>}
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
