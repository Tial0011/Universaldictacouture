import { Link } from "react-router-dom";
import StitchArrowIcon from "./icons/StitchArrowIcon";
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
      <StitchArrowIcon size={16} />
    </Link>
  );
}
