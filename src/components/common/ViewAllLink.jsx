import { Link } from "react-router-dom";
import "./ViewAllLink.css";

/**
 * Shared "View all" link with a trailing arrow — used by every
 * homepage section that previews a fuller page (Shop by Occasion,
 * New In, …) so the treatment matches everywhere it appears.
 */
export default function ViewAllLink({ to, className = "", children = "View all" }) {
  return (
    <Link className={`view-all-link ${className}`.trim()} to={to}>
      {children}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M5 12h13" />
        <path d="m13 6 6 6-6 6" />
      </svg>
    </Link>
  );
}
