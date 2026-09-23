import { useCatalogue } from "../../hooks/useCatalogue";
import { useSavedPieces } from "../../context/SavedPiecesContext";
import ProductGrid from "../../components/product/ProductGrid";
import Button from "../../components/common/Button";
import PageIntro from "../../components/common/PageIntro";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
export default function SavedPieces() {
  useDocumentMeta({ title: "Saved pieces | Universal Dicta Couture", noindex: true });
  const { products, isLoading, error, retry } = useCatalogue();
  const { savedIds, isPersistent, error: saveError } = useSavedPieces();
  const saved = products.filter(product => savedIds.includes(product.id));
  return <><PageIntro title="Saved pieces" description={isPersistent ? "Your saved pieces, ready when you are." : "Your saved pieces are kept for this browser session."} /><section className="container section">
    {saveError && <p role="alert">{saveError}</p>}
    {isLoading ? <p role="status">Loading your pieces…</p> : error ? <><p role="alert">{error}</p><Button onClick={retry}>Try again</Button></> : saved.length ? <ProductGrid products={saved} /> : <p>No published pieces are saved yet.</p>}
    <div className="account-actions"><Button to="/shop">Browse the shop</Button>{!isPersistent && <Button to="/signin" variant="secondary">Sign in</Button>}</div>
  </section></>;
}
