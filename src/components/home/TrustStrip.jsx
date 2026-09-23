import { Link } from "react-router-dom";

/** Homepage service highlights and their supporting copy. */
const ITEMS = [
  {
    id: "delivery",
    label: "Nationwide & International Delivery",
    compactLabel: "Nationwide Delivery",
    caption: "Customer-Paid Delivery",
    compactCaption: "Overseas too · Customer-paid",
    icon: "truck",
  },
  {
    id: "transfer",
    label: "Bank Transfer Only",
    caption: "Simple & Secure Payments",
    compactCaption: "Secure payments",
    icon: "shield",
  },
  {
    id: "authentic",
    label: "Authentic Aso Oke",
    caption: "Authentic. Refined. Timeless.",
    compactCaption: "Premium quality",
    icon: "diamond",
  },
  {
    id: "custom",
    label: "Custom Style",
    caption: "Create What You Want",
    compactCaption: "Made for you",
    icon: "hanger",
    to: "/custom-style",
  },
  {
    id: "chat",
    label: "Dicta Couturier",
    caption: "Personal Guidance, Just for You",
    compactCaption: "Personal guidance",
    icon: "headset",
    to: "/chats",
  },
];

/* Simple line icons, drawn to the same stroke/viewBox convention as
   the header's icon set — no colourful emoji, no icon library. */
function TrustIcon({ name }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    focusable: "false",
  };
  const paths = {
    truck: (
      <>
        <path d="M2.5 6.5h11v9h-11z" />
        <path d="M13.5 10h3.5l3 3v2.5h-6.5z" />
        <circle cx="6" cy="18" r="1.6" />
        <circle cx="16.5" cy="18" r="1.6" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3.5 5 6v5.5c0 4.2 3 6.9 7 9 4-2.1 7-4.8 7-9V6Z" />
        <path d="m9.2 12 1.9 1.9 3.7-3.9" />
      </>
    ),
    diamond: (
      <>
        <path d="M6 4h12l3.5 5L12 21 2.5 9Z" />
        <path d="M2.5 9h19M8.5 4 12 9l3.5-5M12 9l-3 12M12 9l3 12" />
      </>
    ),
    hanger: (
      <>
        <path d="M12 4a1.8 1.8 0 1 1 1.8 1.8" />
        <path d="M12 5.8v2" />
        <path d="M12 7.8 3 14.3a1.5 1.5 0 0 0 .9 2.7h16.2a1.5 1.5 0 0 0 .9-2.7Z" />
      </>
    ),
    headset: (
      <>
        <path d="M4 13.5v-2a8 8 0 0 1 16 0v2" />
        <rect x="2.7" y="12.5" width="4" height="6" rx="1.3" />
        <rect x="17.3" y="12.5" width="4" height="6" rx="1.3" />
        <path d="M19.3 18.5v.7a2.8 2.8 0 0 1-2.8 2.8h-2.3" />
      </>
    ),
  };
  return <svg {...common}>{paths[name]}</svg>;
}

export default function TrustStrip() {
  return (
    <section className="trust-strip-wrap" aria-label="Service information">
      <div className="container">
        <ul className="trust-strip">
          {ITEMS.map((item) => {
            const content = (
              <>
                <span className="trust-strip__icon">
                  <TrustIcon name={item.icon} />
                </span>
                <span className="trust-strip__copy">
                  <span className="trust-strip__label">
                    <span className="trust-strip__wide-copy">{item.label}</span>
                    <span className="trust-strip__compact-copy">{item.compactLabel || item.label}</span>
                  </span>
                  <span className="trust-strip__caption">
                    <span className="trust-strip__wide-copy">{item.caption}</span>
                    <span className="trust-strip__compact-copy">{item.compactCaption || item.caption}</span>
                  </span>
                </span>
              </>
            );
            return (
              <li key={item.id} className="trust-strip__item">
                {item.to ? (
                  <Link to={item.to} className="trust-strip__link">
                    {content}
                  </Link>
                ) : (
                  <span className="trust-strip__static">{content}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
