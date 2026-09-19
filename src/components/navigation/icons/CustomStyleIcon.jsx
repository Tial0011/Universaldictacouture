/**
 * Custom Style mark: a slender wand rising toward the upper right,
 * a small faceted diamond at its tip, and two sparkle accents above
 * it. Original geometry — a stroked line, a diamond and two 4-point
 * sparkle curves — not a generic wand from an icon library.
 *
 * Mirrors src/assets/icons/custom-style.svg; kept inline here so it
 * renders in `currentColor` at crisp sizes without an extra request.
 */
export default function CustomStyleIcon({ size = 22, className = "" }) {
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
      <path d="M5.4 19.4 15 9.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16.35 6.9 17.5 8.05 16.35 9.2 15.2 8.05 Z" fill="currentColor" />
      <path
        d="M19.6 2.6 C 19.89 4.62 19.89 4.62 20.75 5.3 C 19.89 5.97 19.89 5.97 19.6 8.0 C 19.31 5.97 19.31 5.97 18.45 5.3 C 19.31 4.62 19.31 4.62 19.6 2.6 Z"
        fill="currentColor"
      />
      <path
        d="M14.9 4.95 C 15.05 5.96 15.05 5.96 15.5 6.3 C 15.05 6.64 15.05 6.64 14.9 7.65 C 14.75 6.64 14.75 6.64 14.3 6.3 C 14.75 5.96 14.75 5.96 14.9 4.95 Z"
        fill="currentColor"
      />
    </svg>
  );
}
