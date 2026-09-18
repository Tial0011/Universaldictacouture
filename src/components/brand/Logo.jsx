import { LOGO } from "./logoAsset";
import "./Logo.css";

/**
 * The official Universal Dicta Couture logo, rendered from artwork only.
 * `size` picks a height token: "header" (default) or "footer".
 */
export default function Logo({ size = "header", className = "" }) {
  return (
    <img
      src={LOGO.src}
      width={LOGO.width}
      height={LOGO.height}
      alt={LOGO.alt}
      className={`logo logo--${size}${className ? ` ${className}` : ""}`}
      decoding="async"
    />
  );
}
