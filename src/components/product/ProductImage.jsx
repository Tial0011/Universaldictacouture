import { useEffect, useState } from "react";
import "./ProductImage.css";

/**
 * Product / editorial imagery.
 *
 * Netlify image URLs are delivered as stored. Plain URLs are used as-is
 * without inventing derivative URLs.
 */
export default function ProductImage({
  image,
  alt,
  className = "",
  loading = "lazy",
  fetchPriority = "auto",
  width,
  height,
}) {
  const src = image?.url || image?.secureUrl || image?.secure_url || "";
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    const label = alt || image?.alt || "";
    return (
      <span
        className={`product-image product-image--empty ${className}`}
        role={label ? "img" : undefined}
        aria-label={label ? `${label} image unavailable` : undefined}
        aria-hidden={label ? undefined : "true"}
      />
    );
  }

  return (
    <img
      src={src}
      alt={image?.alt || alt || ""}
      className={`product-image ${className}`}
      loading={loading}
      fetchPriority={fetchPriority}
      decoding="async"
      width={width}
      height={height}
      onError={() => setFailed(true)}
    />
  );
}
