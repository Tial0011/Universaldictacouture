/**
 * Stitch Arrow — the brand's "go" arrow. The shaft starts as a short
 * running stitch (two dashes) and finishes as a solid thread into the
 * arrowhead, so every "View Piece →" / "View all →" reads as a needle
 * pulling thread rather than a stock chevron.
 *
 * Draws in `currentColor`, so it follows the text colour of whatever
 * button or link it sits in. Decorative — the link text carries the
 * meaning.
 */
export default function StitchArrowIcon({ size = 16, className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2.5 12h2" />
      <path d="M6.6 12h2" />
      <path d="M10.7 12h9" />
      <path d="m15 6.6 5.4 5.4-5.4 5.4" />
    </svg>
  );
}
