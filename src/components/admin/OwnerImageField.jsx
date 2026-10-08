import { useEffect, useRef, useState } from "react";
import { accountRequest } from "../../services/accountApi";
import { auth } from "../../firebase/auth";
import Button from "../common/Button";
import { getImageUrl } from "../../cloudinary/cloudinary";
import { usePrincipalFence } from "../../hooks/usePrincipalFence";
import { ownerErrorCopy, readOperationMarker, writeOperationMarker, clearOperationMarker } from "../../services/ownerOperation";
import { useStaff } from "../../context/StaffContext";
function PrivatePreview({ image }) {
  const [preview, setPreview] = useState(null);
  const scope=`${auth.currentUser?.uid}:${image.referenceId}`;
  const fence=usePrincipalFence(scope,()=>setPreview(null));
  useEffect(() => {
    if (!image.referenceId || !auth.currentUser) return;
    let live = true, objectUrl; const uid = auth.currentUser.uid,ticket=fence.begin();
    auth.currentUser.getIdToken().then(async token => {
      const read = () => fetch(`/.netlify/functions/account?action=staff-media-deliver&referenceId=${encodeURIComponent(image.referenceId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      let response = await read();
      if (response.status === 401) {
        await accountRequest("session-start", { kind: "staff", keepSignedIn: false, label: "Current browser" }, { principalUid: uid });
        response = await read(); // Authoritative no-execution read only.
      }
      if (!response.ok) return;
      const bytes = await response.blob();
      if (!live || !fence.current(ticket)) return;
      objectUrl = URL.createObjectURL(bytes); setPreview({scope,url:objectUrl});
    }).catch(() => {});
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [image.referenceId,scope,fence]);
  return preview?.scope===scope ? <img src={preview.url} alt={image.alt || "Private Product photo"} /> : <span>Private preview unavailable</span>;
}
export default function OwnerImageField({ id, product, onChange, setUploading }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const staffContext=useStaff();
  const marker=`udc:product-media-stage:${auth.currentUser?.uid}:${staffContext?.staff?.staffId}:${product.id}:${product._version||0}`;
  const [pending,setPending]=useState(()=>readOperationMarker(marker));
  const [recovered,setRecovered]=useState(null);
  const generation = useRef(0), previews = useRef([]), live = useRef(true);
  const scope=`${auth.currentUser?.uid}:${product.id}:${product._version||0}`;
  const [available,setAvailable]=useState(true);
  const fence=usePrincipalFence(scope,()=>{setAvailable(false);setBusy(false);setUploading(false);generation.current++;});
  useEffect(() => { live.current = true; const urls = previews.current; return () => { live.current = false; urls.forEach(url => URL.revokeObjectURL(url)); }; }, []);
  const images = product.images || [];
  async function stage(event) {
    const selected = [...event.target.files]; event.target.value = "";
    if (!selected.length || !product.id || pending || images.length + selected.length > 8) return;
    const uid = auth.currentUser?.uid, ticket = ++generation.current,contextTicket=fence.begin();
    setBusy(true); setUploading(true); setError("");
    try {
      const staged = [];
      for (const file of selected) {
        if (file.size > 4 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw Error("Choose a JPEG, PNG or WebP image up to 4 MB.");
        const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
        const operationId=crypto.randomUUID();writeOperationMarker(marker,{operationId});
        const result = await accountRequest("staff-media-stage", { operationId, domain: "product", objectId: product.id, expectedVersion: product._version || 0, contentType: file.type, base64 }, { principalUid: uid });
        if (!live.current || ticket !== generation.current || !fence.current(contextTicket)) return;
        const preview = URL.createObjectURL(file); previews.current.push(preview);
        staged.push({ assetId: result.assetId, url: preview, alt: "" });
        onChange([...images,...staged]);clearOperationMarker(marker);
      }
      if (live.current && ticket === generation.current && fence.current(contextTicket)) onChange([...images, ...staged]);
    } catch (reason) { if (live.current&&fence.current(contextTicket)) {if(reason.code==="invalid-media"||reason.code==="operation-storage-unavailable")clearOperationMarker(marker);setPending(readOperationMarker(marker));setError(ownerErrorCopy(reason,"The private upload"));} }
    finally { if (live.current&&fence.current(contextTicket)) { setBusy(false); setUploading(Boolean(readOperationMarker(marker))); } }
  }
  async function check(){if(!pending||busy)return;const ticket=fence.begin();setBusy(true);setError("Checking the original private upload…");try{
    const result=await accountRequest("staff-media-stage-reconcile",{operationId:pending.operationId},{principalUid:ticket.uid});if(!fence.current(ticket))return;
    if(result.state==="staged"){
      clearOperationMarker(marker);setPending(null);setUploading(false);setRecovered({scope,assetId:result.assetId});setError("Private upload confirmed. It is still staged—not attached or published. Review it before using it in this draft.");return;
    }
    setError(result.state==="stale"?"The Product changed. The old upload cannot be attached automatically.":"The upload is still unconfirmed. It has not been repeated.");
  }catch(reason){if(fence.current(ticket))setError(ownerErrorCopy(reason,"The upload outcome"));}finally{if(fence.current(ticket))setBusy(false);}}
  if(!available)return <p role="status">Private media access must be checked. Reopen the current Product before continuing.</p>;
  return <div className="admin-stack">
    {!product.id && <p>Save the initial Draft before uploading private working photos.</p>}
    <input id={id} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || Boolean(pending) || !product.id} onChange={stage} />
    {busy && <p role="status">Staging private photos…</p>}{error && <p role="status" aria-atomic="true">{error}</p>}
    {pending&&<Button disabled={busy} variant="secondary" onClick={check}>Check upload outcome</Button>}
    {recovered?.scope===scope&&<Button variant="secondary" disabled={busy||images.length>=8} onClick={()=>{if(fence.current(fence.begin())){onChange(images.some(image=>image.assetId===recovered.assetId)?images:[...images,{assetId:recovered.assetId,alt:""}]);setRecovered(null);}}}>Use recovered photo in this draft</Button>}
    <div className="admin-image-grid">{images.map((image, index) => <div className="admin-image" key={image.assetId || image.referenceId || image.url || index}>
      {image.referenceId ? <PrivatePreview image={image} /> : image.url||image.publicId ? <img src={image.publicId ? getImageUrl(image.publicId) : image.url} alt={image.alt || "Product photo"} /> : <span>Staged private photo. Preview unavailable.</span>}
      <label htmlFor={`${id}-alt-${index}`}>Photo {index + 1} description</label><input id={`${id}-alt-${index}`} disabled={busy} value={image.alt || ""} maxLength={250} onChange={event => onChange(images.map((value, i) => i === index ? { ...value, alt: event.target.value } : value))} />
      <Button variant="ghost" disabled={busy} onClick={() => onChange(images.filter((_, i) => i !== index))}>Remove photo {index + 1}</Button>
    </div>)}</div>
    <p>Uploaded photos remain staged until the Product save is confirmed. Removing a reference does not purge retained bytes.</p>
  </div>;
}
