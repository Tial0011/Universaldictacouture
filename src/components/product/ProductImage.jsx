import { useEffect, useState } from "react";
import { getImageUrl } from "../../cloudinary/cloudinary";
import "./ProductImage.css";

/**
 * Product / editorial imagery.
 *
 * Cloudinary public IDs are delivered through a sized, auto-format
 * transformation; a plain URL is used as-is. Missing or failed media
 * degrades to the existing neutral branded frame instead of exposing
 * browser broken-image UI.
 */
export default function ProductImage({
  image,
  alt,
  transformation = "w_1200,h_1500,c_limit,q_auto,f_auto",
  className = "",
  loading = "lazy",
  sizes,
}) {
  const src = image?.publicId ? getImageUrl(image.publicId, transformation) : image?.url || "";
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
      decoding="async"
      sizes={sizes}
      onError={() => setFailed(true)}
    />
  );
}
