import { useEffect, useRef, useState } from "react";
import { accountRequest } from "../../services/accountApi";
import { auth } from "../../firebase/auth";
import Button from "../common/Button";
import { getImageUrl } from "../../cloudinary/cloudinary";
function PrivatePreview({ image }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!image.referenceId || !auth.currentUser) return;
    let live = true, objectUrl; const uid = auth.currentUser.uid;
    auth.currentUser.getIdToken().then(async token => {
      const read = () => fetch(`/.netlify/functions/account?action=staff-media-deliver&referenceId=${encodeURIComponent(image.referenceId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      let response = await read();
      if (response.status === 401) {
        await accountRequest("session-start", { kind: "staff", keepSignedIn: false, label: "Current browser" }, { principalUid: uid });
        response = await read(); // Authoritative no-execution read only.
      }
      if (!response.ok) return;
      const bytes = await response.blob();
      if (!live || auth.currentUser?.uid !== uid) return;
      objectUrl = URL.createObjectURL(bytes); setUrl(objectUrl);
    }).catch(() => {});
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [image.referenceId]);
  return url ? <img src={url} alt={image.alt || "Private Product photo"} /> : <span>Private preview unavailable</span>;
}
export default function OwnerImageField({ id, product, onChange, setUploading }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const generation = useRef(0), previews = useRef([]), live = useRef(true);
  useEffect(() => { live.current = true; const urls = previews.current; return () => { live.current = false; urls.forEach(url => URL.revokeObjectURL(url)); }; }, []);
  const images = product.images || [];
  async function stage(event) {
    const selected = [...event.target.files]; event.target.value = "";
    if (!selected.length || !product.id || images.length + selected.length > 8) return;
    const uid = auth.currentUser?.uid, ticket = ++generation.current;
    setBusy(true); setUploading(true); setError("");
    try {
      const staged = [];
      for (const file of selected) {
        if (file.size > 4 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw Error("Choose a JPEG, PNG or WebP image up to 4 MB.");
        const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
        const result = await accountRequest("staff-media-stage", { operationId: crypto.randomUUID(), domain: "product", objectId: product.id, expectedVersion: product._version || 0, contentType: file.type, base64 }, { principalUid: uid });
        if (!live.current || ticket !== generation.current || auth.currentUser?.uid !== uid) return;
        const preview = URL.createObjectURL(file); previews.current.push(preview);
        staged.push({ assetId: result.assetId, url: preview, alt: "" });
      }
      if (live.current && ticket === generation.current) onChange([...images, ...staged]);
    } catch (reason) { if (live.current) setError(reason.message || "Upload not confirmed. Check the request before choosing again."); }
    finally { if (live.current) { setBusy(false); setUploading(false); } }
  }
  return <div className="admin-stack">
    {!product.id && <p>Save the initial Draft before uploading private working photos.</p>}
    <input id={id} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || !product.id} onChange={stage} />
    {busy && <p role="status">Staging private photos…</p>}{error && <p role="alert">{error}</p>}
    <div className="admin-image-grid">{images.map((image, index) => <div className="admin-image" key={image.assetId || image.referenceId || image.url || index}>
      {image.referenceId ? <PrivatePreview image={image} /> : <img src={image.publicId ? getImageUrl(image.publicId) : image.url} alt={image.alt || "Product photo"} />}
      <label htmlFor={`${id}-alt-${index}`}>Photo {index + 1} description</label><input id={`${id}-alt-${index}`} value={image.alt || ""} maxLength={250} onChange={event => onChange(images.map((value, i) => i === index ? { ...value, alt: event.target.value } : value))} />
      <Button variant="ghost" disabled={busy} onClick={() => onChange(images.filter((_, i) => i !== index))}>Remove photo {index + 1}</Button>
    </div>)}</div>
    <p>Uploaded photos remain staged until the Product save is confirmed. Removing a reference does not purge retained bytes.</p>
  </div>;
}
