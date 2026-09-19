/**
 * Minimal outline social icons for the Footer, drawn in the same
 * thin-stroke, currentColor style as the navbar icons. Original
 * geometry (a rounded-square badge with a simple mark inside) — not
 * traced from any brand's official logo asset.
 */
const common = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.5",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
  focusable: "false",
};

function Badge() {
  return <rect x="3" y="3" width="18" height="18" rx="6" />;
}

export function FacebookIcon(props) {
  return (
    <svg {...common} width={props.size ?? 20} height={props.size ?? 20} className={props.className}>
      <Badge />
      <path d="M13.6 20.4v-6.9h2.2l.35-2.6h-2.55v-1.65c0-.75.2-1.26 1.28-1.26h1.37V5.62c-.24-.03-1.05-.1-1.99-.1-1.97 0-3.31 1.2-3.31 3.42v1.91H8.75v2.6h2.2v6.9" />
    </svg>
  );
}

export function InstagramIcon(props) {
  return (
    <svg {...common} width={props.size ?? 20} height={props.size ?? 20} className={props.className}>
      <Badge />
      <circle cx="12" cy="12" r="4.1" />
      <circle cx="16.85" cy="7.15" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function LinkedInIcon(props) {
  return (
    <svg {...common} width={props.size ?? 20} height={props.size ?? 20} className={props.className}>
      <Badge />
      <circle cx="8.1" cy="8.35" r="0.95" fill="currentColor" stroke="none" />
      <path d="M8.1 11.3V18" />
      <path d="M12.3 18v-6.6" />
      <path d="M12.3 13c.5-1.1 1.4-1.8 2.4-1.8 1.6 0 2.4 1.1 2.4 2.9V18" />
    </svg>
  );
}

export function WhatsAppIcon(props) {
  return (
    <svg {...common} width={props.size ?? 20} height={props.size ?? 20} className={props.className}>
      <path d="M12 4.5a7.5 7.5 0 0 0-6.4 11.4L4.5 19.5l3.8-1a7.5 7.5 0 1 0 3.7-14Z" />
      <path d="M9.1 9.35c.2 1.15.75 2.2 1.6 3.05.85.85 1.9 1.4 3.05 1.6" />
      <circle cx="9.05" cy="9.3" r="0.55" fill="currentColor" stroke="none" />
      <circle cx="13.85" cy="14.1" r="0.55" fill="currentColor" stroke="none" />
    </svg>
  );
}
