/**
 * Small line icons for the Shop toolbar. Same 24px grid and stroke as
 * the header icons; they draw in `currentColor` and are decorative —
 * the button or label next to them carries the meaning.
 */
function Icon({ size = 20, children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function SlidersIcon({ size }) {
  return (
    <Icon size={size}>
      <path d="M4 7h9M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </Icon>
  );
}

export function ChevronDownIcon({ size }) {
  return (
    <Icon size={size}>
      <path d="m6 9.5 6 6 6-6" />
    </Icon>
  );
}

export function GridViewIcon({ size }) {
  return (
    <Icon size={size}>
      <rect x="4.5" y="4.5" width="6" height="6" rx="1" />
      <rect x="13.5" y="4.5" width="6" height="6" rx="1" />
      <rect x="4.5" y="13.5" width="6" height="6" rx="1" />
      <rect x="13.5" y="13.5" width="6" height="6" rx="1" />
    </Icon>
  );
}

export function ListViewIcon({ size }) {
  return (
    <Icon size={size}>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <path d="M4 6.5h.01M4 12h.01M4 17.5h.01" />
    </Icon>
  );
}
