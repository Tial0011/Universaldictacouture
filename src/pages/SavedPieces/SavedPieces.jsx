import { useCatalogue } from "../../hooks/useCatalogue";
import { useSavedPieces } from "../../context/SavedPiecesContext";
import ProductGrid from "../../components/product/ProductGrid";
import Button from "../../components/common/Button";
import PageIntro from "../../components/common/PageIntro";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
export default function SavedPieces() {
  useDocumentMeta({ title: "My Pieces | Universal Dicta Couture", noindex: true });
  const { products, isLoading, error, retry } = useCatalogue();
  const { savedIds, isPersistent, isReady, storage, error: saveError, retrySync } = useSavedPieces();
  const saved = products.filter(product => savedIds.includes(product.id));
  return <><PageIntro eyebrow="My Closet" title="My Pieces" description={storage === "unavailable" ? "Your account pieces are shown only after current access is checked." : isPersistent ? "Pieces you have saved, ready when you are." : "Pieces you save are kept in this browser."} /><section className="container section">
    {saveError && <div role="status"><p>{saveError}</p>{isPersistent && <Button variant="secondary" onClick={retrySync}>Retry account sync</Button>}</div>}
    {!isReady || isLoading ? <p role="status">Checking your saved pieces…</p> : error ? <><p role="alert">{error}</p><Button onClick={retry}>Try again</Button></> : saved.length ? <ProductGrid products={saved} /> : <p>No published pieces are saved yet.</p>}
    <div className="account-actions"><Button to="/my-closet" variant="secondary">My Closet</Button><Button to="/my-closet/saved-reviews" variant="secondary">Saved Reviews</Button><Button to="/shop">Browse the shop</Button>{!isPersistent && <Button to="/signin" variant="secondary">Sign in</Button>}</div>
  </section></>;
}
