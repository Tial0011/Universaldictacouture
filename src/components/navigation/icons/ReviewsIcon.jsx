/**
 * Outlined five-point star for Review & Feeds. A single unfilled
 * star polygon — not a filled star and not a library glyph.
 *
 * Mirrors src/assets/icons/reviews-star.svg; kept inline here so it
 * renders in `currentColor` at crisp sizes without an extra request.
 */
export default function ReviewsIcon({ size = 22, className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 4.1 13.94 9.73 19.89 9.84 15.14 13.42 16.88 19.11 12 15.7 7.12 19.11 8.86 13.42 4.11 9.84 10.06 9.73 Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
