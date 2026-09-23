import { Link } from "react-router-dom";
import { useCloset } from "../../context/ClosetContext";
import ProductImage from "../../components/product/ProductImage";
import Button from "../../components/common/Button";
import { formatNaira } from "../../utils/formatters";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import { closetEnquiry } from "../../services/chatModel";
import "../Profile/Profile.css";
export default function MyCloset() {
  useDocumentMeta({ title: "My Closet | Universal Dicta Couture", noindex: true });
  const { lines, removeFromCloset } = useCloset();
  return <section className="account-page container"><div className="account-card"><h1>My Closet</h1><p>Your selected pieces for this browser session. Adding a piece does not place an order or make a payment.</p>
    {lines.length ? <ul className="customer-list">{lines.map(line => <li className="customer-piece" key={line.key}><ProductImage image={line.image} alt={line.name} /><div><h2><Link to={"/shop/" + encodeURIComponent(line.slug || line.productId)}>{line.name}</Link></h2><p>{formatNaira(line.price)} · Quantity: {line.quantity}</p><p>{Object.entries(line.selections || {}).map(([key,value]) => key + ": " + value).join(" · ")}</p><Button variant="ghost" onClick={() => removeFromCloset(line.key)}>Remove {line.name}</Button></div></li>)}</ul> : <p>Your closet is empty. Browse the shop to find a piece you love.</p>}
    <div className="account-actions"><Button to="/shop">Browse the shop</Button>{lines.length > 0 && <Button to="/chats" state={{ draft: closetEnquiry(lines) }} variant="secondary">Ask about these pieces</Button>}</div>
  </div></section>;
}
