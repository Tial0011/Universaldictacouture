import { useCatalogue } from "../../hooks/useCatalogue";
import { useSavedPieces } from "../../context/SavedPiecesContext";
import ProductGrid from "../../components/product/ProductGrid";
import Button from "../../components/common/Button";
import PageIntro from "../../components/common/PageIntro";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
export default function SavedPieces() {
  useDocumentMeta({ title: "My Pieces | Universal Dicta Couture", noindex: true });
  const { products, isLoading, error, retry } = useCatalogue();
  const { savedIds, isPersistent, error: saveError } = useSavedPieces();
  const saved = products.filter(product => savedIds.includes(product.id));
  return <><PageIntro eyebrow="My Closet" title="My Pieces" description={isPersistent ? "Pieces you have saved, ready when you are." : "Pieces you save are kept for this browser session."} /><section className="container section">
    {saveError && <p role="alert">{saveError}</p>}
    {isLoading ? <p role="status">Loading your pieces…</p> : error ? <><p role="alert">{error}</p><Button onClick={retry}>Try again</Button></> : saved.length ? <ProductGrid products={saved} /> : <p>No published pieces are saved yet.</p>}
    <div className="account-actions"><Button to="/my-closet" variant="secondary">My Closet</Button><Button to="/shop">Browse the shop</Button>{!isPersistent && <Button to="/signin" variant="secondary">Sign in</Button>}</div>
  </section></>;
}
