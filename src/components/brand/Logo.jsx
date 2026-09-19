import { LOGO, LOGO_WHITE } from "./logoAsset";
import "./Logo.css";

/**
 * The official Universal Dicta Couture logo, rendered from artwork only.
 * `size` picks a height token: "header" (default) or "footer".
 * `variant="white"` swaps in the white knockout for use directly on
 * the wine surface (see LOGO_WHITE) instead of the wine/near-black
 * original, which needs a light background to stay legible.
 */
export default function Logo({ size = "header", variant = "default", className = "" }) {
  const asset = variant === "white" ? LOGO_WHITE : LOGO;
  return (
    <img
      src={asset.src}
      width={asset.width}
      height={asset.height}
      alt={asset.alt}
      className={`logo logo--${size}${className ? ` ${className}` : ""}`}
      decoding="async"
    />
  );
}
