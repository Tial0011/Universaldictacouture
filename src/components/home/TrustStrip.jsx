import { Link } from "react-router-dom";

/** The approved service/trust items — no guarantees, percentages or
 *  payment instructions are added to them. */
const ITEMS = [
  { id: "delivery", label: "Nationwide & International Delivery" },
  { id: "transfer", label: "Bank Transfer Only" },
  { id: "authentic", label: "Authentic Aso Oke" },
  { id: "custom", label: "Custom Style", to: "/custom-style" },
  { id: "chat", label: "Chat with Dicta Couturier", to: "/chats" },
];

export default function TrustStrip() {
  return (
    <section className="trust-strip" aria-label="Service information">
      <ul className="container trust-strip__list">
        {ITEMS.map((item) => (
          <li key={item.id} className="trust-strip__item">
            {item.to ? (
              <Link to={item.to} className="trust-strip__link">
                {item.label}
              </Link>
            ) : (
              <span>{item.label}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
