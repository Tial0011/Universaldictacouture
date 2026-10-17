import { Link } from "react-router-dom";
import ProductImage from "../product/ProductImage";
import { normaliseProductContext } from "../../services/chatModel";
import { formatNaira } from "../../utils/formatters";
import "./ChatProductTag.css";

export default function ChatProductTag({ context }) {
  const piece = normaliseProductContext(context);
  if (!piece) return null;
  return <aside className="chat-product-tag" aria-label={`Discussing ${piece.name}`}>
    <Link className="chat-product-tag__piece" to={`/shop/${encodeURIComponent(piece.slug || piece.productId)}`}>
      <div className="chat-product-tag__image"><ProductImage image={{ url: piece.imageUrl, publicId: piece.imagePublicId }} alt={piece.name} transformation="w_160,h_200,c_limit,q_auto,f_auto" /></div>
      <div><span>{piece.reviewId ? "From a customer review" : "Discussing this piece"}</span><strong>{piece.name}</strong>{piece.price !== null && <small>{piece.variable ? "From " : ""}{formatNaira(piece.price)} · At time of enquiry</small>}<span className="chat-product-tag__view">View piece ↗</span></div>
    </Link>
    {piece.reviewId && <Link className="chat-product-tag__review" to={`/reviews-feeds?review=${encodeURIComponent(piece.reviewId)}`}>Read the original review</Link>}
  </aside>;
}
