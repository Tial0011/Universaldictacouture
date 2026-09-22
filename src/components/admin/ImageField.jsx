import { useState } from "react";
import { getImageUrl } from "../../cloudinary/cloudinary";
import { uploadImage } from "../../services/imageStorage";
import { imageValue } from "../../services/adminModel";
import Button from "../common/Button";
export default function ImageField({ id, value, onChange, multiple = false, setUploading }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const images = multiple ? (Array.isArray(value) ? value : value ? [value] : []) : value ? [value] : [];
  async function upload(event) {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";
    if (!selected.length) return;
    setError("");
    if (selected.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024)) {
      setError("Choose JPEG, PNG or WebP images smaller than 4 MB."); return;
    }
    if (multiple && images.length + selected.length > 8) { setError("Use up to 8 photos per product."); return; }
    setBusy(true); setUploading(true);
    const next = [...images];
    try {
      for (const file of selected) {
        const image = await uploadImage(file);
        next.push({ ...image, alt: "" });
        onChange(multiple ? [...next] : image);
      }
    } catch (error) { setError((error.message || "The upload could not finish.") + " Successfully uploaded photos remain below."); }
    finally { setBusy(false); setUploading(false); }
  }
  function changeImage(index, patch) {
    const next = images.map((image, i) => i === index ? { ...imageValue(image), ...patch } : image);
    onChange(multiple ? next : next[0]);
  }
  return <div className="admin-stack">
    <input id={id} type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} disabled={busy} onChange={upload} />
    {busy && <p role="status">Uploading photos…</p>}
    {error && <p role="alert" className="field__error">{error}</p>}
    <div className="admin-image-grid">{images.map((raw, index) => {
      const image = imageValue(raw);
      return <div className="admin-image" key={index}>
        <img src={image.url || getImageUrl(image.publicId)} alt={image.alt || "Uploaded photo " + (index + 1)} />
        <label htmlFor={id + "-alt-" + index}>Photo {index + 1} description</label>
        <input id={id + "-alt-" + index} value={image.alt || ""} maxLength={250} onChange={event => changeImage(index, { alt: event.target.value })} />
        <div className="admin-actions">{multiple && index > 0 && <Button variant="ghost" onClick={() => onChange([images[index], ...images.filter((_, i) => i !== index)])}>Make cover</Button>}
        <Button variant="ghost" onClick={() => onChange(multiple ? images.filter((_, i) => i !== index) : null)}>Remove photo {index + 1}</Button></div>
      </div>;
    })}</div>
    <p className="field__hint">Removing a photo here removes it from this record when saved. The stored photo is retained until the site owner removes it from image storage.</p>
  </div>;
}
