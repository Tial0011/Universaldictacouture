import { getImageUrl } from "../../cloudinary/cloudinary";

/**
 * Product / editorial imagery.
 *
 * Cloudinary public IDs are delivered through a sized, auto-format
 * transformation; a plain URL is used as-is. When an image is missing
 * the frame stays empty rather than showing a stand-in photograph of a
 * piece that is not the product.
 */
export default function ProductImage({
  image,
  alt,
  transformation = "w_600,h_750,c_fill,g_auto,q_auto,f_auto",
  className = "",
  loading = "lazy",
  sizes,
}) {
  const src = image?.publicId ? getImageUrl(image.publicId, transformation) : image?.url || "";

  if (!src) {
    return <span className={`product-image product-image--empty ${className}`} aria-hidden="true" />;
  }

  return (
    <img
      src={src}
      alt={image?.alt || alt || ""}
      className={`product-image ${className}`}
      loading={loading}
      decoding="async"
      sizes={sizes}
    />
  );
}
