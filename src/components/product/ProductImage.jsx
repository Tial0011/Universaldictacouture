import { useEffect, useMemo, useState } from "react";
import { getImageUrl } from "../../cloudinary/cloudinary";
import "./ProductImage.css";

/**
 * Product / editorial imagery.
 *
 * Cloudinary public IDs are delivered through sized, auto-format
 * transformations. Where callers provide supported responsive transforms,
 * the browser receives a real srcset and chooses an appropriate asset.
 * Plain URLs are used as-is without inventing derivative URLs.
 */
export default function ProductImage({
  image,
  alt,
  transformation = "w_1200,h_1500,c_limit,q_auto,f_auto",
  srcSetSources = [],
  className = "",
  loading = "lazy",
  fetchPriority = "auto",
  sizes,
  width,
  height,
}) {
  const src = image?.publicId ? getImageUrl(image.publicId, transformation) : image?.url || "";
  const srcSet = useMemo(() => {
    if (!image?.publicId || !Array.isArray(srcSetSources) || srcSetSources.length === 0) return "";
    return srcSetSources
      .filter((source) => Number.isFinite(source?.width) && source.width > 0 && source?.transformation)
      .map((source) => {
        const url = getImageUrl(image.publicId, source.transformation);
        return url ? `${url} ${source.width}w` : "";
      })
      .filter(Boolean)
      .join(", ");
  }, [image?.publicId, srcSetSources]);
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
      srcSet={srcSet || undefined}
      alt={image?.alt || alt || ""}
      className={`product-image ${className}`}
      loading={loading}
      fetchPriority={fetchPriority}
      decoding="async"
      sizes={srcSet ? sizes : undefined}
      width={width}
      height={height}
      onError={() => setFailed(true)}
    />
  );
}
