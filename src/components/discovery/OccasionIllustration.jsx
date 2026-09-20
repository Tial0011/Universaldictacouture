/**
 * Temporary stand-in for Shop by Occasion imagery: a simple line
 * illustration, never a photo. Swap an occasion's real photograph in
 * via its product data whenever one exists — DiscoveryModule falls
 * back to this only when an item has no image yet (see Home.jsx).
 */
const ICONS = {
  "Wedding Guest": (
    <>
      <path d="M12 6.5c1.1-1.4 3.4-1.3 3.4.8 0 2-2.1 3.3-3.4 4.4-1.3-1.1-3.4-2.4-3.4-4.4 0-2.1 2.3-2.2 3.4-.8Z" />
      <path d="M12 12.5v9" />
      <path d="M7.5 21.5c1-3.6 2.7-5.5 4.5-5.5s3.5 1.9 4.5 5.5" />
    </>
  ),
  Bridal: (
    <>
      <path d="M12 5.2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z" />
      <path d="M6 21.5c.6-6.2 3-9.3 6-9.3s5.4 3.1 6 9.3" />
      <path d="M4 12.8c2-1.6 4.2-1 4.9.6M20 12.8c-2-1.6-4.2-1-4.9.6" />
    </>
  ),
  "Traditional Engagement": (
    <>
      <circle cx="9" cy="14.5" r="4" />
      <circle cx="15" cy="14.5" r="4" />
      <path d="M12 7.5 10 11M12 7.5l2 3.5" />
    </>
  ),
  Celebration: (
    <>
      <path d="M6 21.5 9 10.5l6 2.5-3.5 8.5Z" />
      <path d="M9 10.5 15 4M12 4.5l1.2 2.4M17 6.5l1.8 1.8M15.5 3.2l2.3.9" />
    </>
  ),
  "Church/Event": (
    <>
      <path d="M12 3.5v3" />
      <path d="M12 3.5 8.5 6M12 3.5 15.5 6" />
      <path d="M6 21.5V12l6-4.5 6 4.5v9.5" />
      <path d="M10 21.5v-5h4v5" />
    </>
  ),
};

const DEFAULT_ICON = (
  <>
    <circle cx="12" cy="12" r="7.5" />
    <path d="M12 8v4l2.5 2.5" />
  </>
);

export default function OccasionIllustration({ name }) {
  return (
    <span className="occasion-illustration" aria-hidden="true">
      <svg
        width="34"
        height="34"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ICONS[name] ?? DEFAULT_ICON}
      </svg>
    </span>
  );
}
