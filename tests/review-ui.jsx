// Dev-only fixture, not imported by the production entry point or catalogue.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "../src/styles/global.css";
import ReviewGrid from "../src/components/reviews/ReviewGrid";
import ReviewCard from "../src/components/reviews/ReviewCard";
import ChatProductTag from "../src/components/chat/ChatProductTag";
import { productChatContext } from "../src/services/chatModel";
import "../src/pages/ReviewsFeeds/ReviewsFeeds.css";

const photo = { url: "/src/assets/images/hero/hero-ready-to-wear.jpg" };
const piece = { id: "test-piece", name: "Wine Aso Oke Set", slug: "test-piece", image: photo, minPrice: 50000, href: "/shop/test-piece" };
const common = { author: "Sample customer", customerServiceRating: 5, productQualityRating: 4, productId: piece.id, body: "The texture, the fit, the finish — a piece I’ll return to for special moments.", publishedAt: "2026-09-20" };
const entries = [
  { ...common, id: "portrait-1", image: photo },
  { ...common, id: "written-1", body: "Beautiful weaving and a lovely finish. The studio helped me choose the right size." },
  { ...common, id: "written-2", body: "A special piece for a special day. Thank you for the thoughtful service." },
  { ...common, id: "portrait-2", image: photo },
  { ...common, id: "long-written", author: "An intentionally very long customer name for layout checks", body: common.body.repeat(12) },
  { ...common, id: "unavailable", productSnapshot: { name: "Archived piece", price: null }, productId: "unavailable" },
];
export default function Fixture() {
  const [saved, setSaved] = useState([]);
  const [filter, setFilter] = useState("all");
  return <main className="reviews-page"><div className="container reviews-page__content">
    <p>Responsive test fixtures — sample stories, not customer reviews.</p>
    <div className="reviews-page__filters">{["all", "photos", "written"].map(value => <button key={value} onClick={() => setFilter(value)}>{value}</button>)}</div>
    <ReviewGrid>{entries.filter(entry => filter === "all" || (filter === "photos" ? entry.image : !entry.image)).map(entry => <ReviewCard key={entry.id} entry={entry} product={entry.productId === piece.id ? piece : null} saved={saved.includes(entry.id)} onSave={() => setSaved(ids => ids.includes(entry.id) ? ids.filter(id => id !== entry.id) : [...ids, entry.id])} showDate />)}</ReviewGrid>
    <section><h2>Product tag preview</h2><ChatProductTag context={productChatContext(piece, entries[0])} /><p>The customer’s message belongs below this card.</p></section>
  </div></main>;
}
createRoot(document.getElementById("root")).render(<BrowserRouter><Fixture /></BrowserRouter>);
