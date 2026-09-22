import { useState } from "react";
import { useParams } from "react-router-dom";
import { useCatalogue } from "../../hooks/useCatalogue";
import { useCloset } from "../../context/ClosetContext";
import { useSavedPieces } from "../../context/SavedPiecesContext";
import ProductImage from "../../components/product/ProductImage";
import Button from "../../components/common/Button";
import { formatNaira } from "../../utils/formatters";
import { priceForSelections } from "../../services/productModel";
import "../Profile/Profile.css";
export default function ProductDetails() {
  const { productId } = useParams();
  const { products, isLoading, error, retry } = useCatalogue();
  const product = products.find(item => item.slug === productId || item.id === productId);
  if (isLoading) return <section className="container section"><p role="status">Loading this piece…</p></section>;
  if (error) return <section className="container section"><p role="alert">{error}</p><Button onClick={retry}>Try again</Button></section>;
  if (!product) return <section className="container section"><h1>Piece unavailable</h1><p>This piece is not currently published.</p><Button to="/shop">Back to shop</Button></section>;
  return <Piece key={product.id} product={product} />;
}
function Piece({ product }) {
  const { addToCloset } = useCloset();
  const { isSaved, toggleSaved, error } = useSavedPieces();
  const [selections,setSelections] = useState({});
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  async function add(event) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = await addToCloset(product,selections);
      setMessage(result.status === "added" ? "Added to your closet." : result.status === "needs-selection" ? "Choose all required options." : "This piece could not be added. Refresh and try again.");
    } finally { setBusy(false); }
  }
  return <section className="account-page container"><div className="account-card"><Button to="/shop" variant="ghost">Back to shop</Button><h1>{product.name}</h1>
    <ProductImage image={product.image} alt={product.name} loading="eager" />
    <p>{formatNaira(priceForSelections(product,selections))} {product.unitLabel}</p>
    <p>{[...product.category,...product.fabric,...product.colour].join(" · ")}</p>
    <form onSubmit={add} className="account-form">{product.options.map(option => <div className="field" key={option.id}><label htmlFor={"option-"+option.id}>{option.name}{option.required ? " (required)" : ""}</label><select id={"option-"+option.id} required={option.required} value={selections[option.name] || (option.values.length === 1 ? option.values[0] : "")} onChange={event=>setSelections({...selections,[option.name]:event.target.value})}><option value="">Choose {option.name}</option>{option.values.map(value=><option key={value}>{value}</option>)}</select></div>)}<div className="account-actions"><Button type="submit" isLoading={busy}>Add to My Closet</Button><Button variant="secondary" onClick={()=>toggleSaved(product.id)}>{isSaved(product.id) ? "Remove from saved" : "Save piece"}</Button><Button to="/my-closet" variant="ghost">View My Closet</Button></div></form>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </div></section>;
}
