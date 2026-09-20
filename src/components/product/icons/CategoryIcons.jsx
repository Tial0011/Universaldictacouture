/**
 * Menu-card category marks for New In.
 *
 * Like the little symbols beside a dish on a restaurant menu, each
 * card ends its price line with a small mark for the kind of piece it
 * is. Three original line drawings, all on a 24-unit grid and drawn in
 * `currentColor`:
 *
 *   Gele   — a coiled, folded head-tie
 *   Weave  — a strip-woven Aso Oke cloth
 *   Thread — a needle with a loop of thread (the general "made by
 *            hand" mark, used when a category has no mark of its own)
 *
 * `categoryIconFor` picks one from the piece's real category names.
 * Nothing is invented: an unrecognised category simply gets Thread.
 */

function Mark({ size, className, children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function GeleIcon({ size = 20, className = "" }) {
  return (
    <Mark size={size} className={className}>
      <path d="M3.8 16.2C3.8 10 7.4 5.5 12 5.5s8.2 4.5 8.2 10.7" />
      <path d="M3.8 16.2c2.6 2 13.8 2 16.4 0" />
      <path d="M12 5.8c-2.2 3.2-2.2 7.6-.6 11.1" />
      <path d="M7.9 7.4c-1.2 3.1-.9 6.4.9 9" />
      <path d="M16.1 7.4c1.2 3.1.9 6.4-.9 9" />
    </Mark>
  );
}

export function WeaveIcon({ size = 20, className = "" }) {
  return (
    <Mark size={size} className={className}>
      <rect x="4" y="4.5" width="16" height="15" rx="1.5" />
      <path d="M9.3 4.5v15" />
      <path d="M14.7 4.5v15" />
      <path d="M4 9.5h16" strokeDasharray="2.2 2.2" />
      <path d="M4 14.5h16" strokeDasharray="2.2 2.2" strokeDashoffset="2.2" />
    </Mark>
  );
}

export function ThreadIcon({ size = 20, className = "" }) {
  return (
    <Mark size={size} className={className}>
      <path d="M19 4.6 8 15.6" />
      <path d="M17.3 3.9c1.2-.4 2.6.9 2 2.2" />
      <path d="M8 15.6c-2-.5-3.6.4-3.9 2.5 1.9.9 4.2.4 5.3-1.3" />
      <path d="M4.1 18.1c-.1 1 .4 1.7 1.2 2" />
    </Mark>
  );
}

const MARKS = [
  { test: /gele|head\s?-?(tie|wrap)|fila/i, Icon: GeleIcon },
  { test: /aso\s?-?oke|weave|fabric|set|wrapper/i, Icon: WeaveIcon },
];

/** Pick the mark for a piece from its category names. */
export function categoryIconFor(categories = []) {
  const haystack = categories.join(" ");
  const match = MARKS.find(({ test }) => test.test(haystack));
  return match ? match.Icon : ThreadIcon;
}
