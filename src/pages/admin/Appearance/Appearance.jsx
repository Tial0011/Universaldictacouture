<<<<<<< HEAD
import { useEffect, useState } from "react";
import ImageField from "../../../components/admin/ImageField";
import Button from "../../../components/common/Button";
import { DEFAULT_AUTH_APPEARANCE, loadAuthAppearanceAdmin, resetAuthAppearanceAdmin, saveAuthAppearanceAdmin } from "../../../services/siteAppearance";
import { adminError } from "../../../services/admin";

export default function Appearance() {
  const [model, setModel] = useState(DEFAULT_AUTH_APPEARANCE);
  const [loading, setLoading] = useState(true);
=======
import { useEffect, useRef, useState } from "react";
import ImageField from "../../../components/admin/ImageField";
import Button from "../../../components/common/Button";
import { DEFAULT_AUTH_APPEARANCE, loadAuthAppearanceAdmin, resetAuthAppearanceAdmin, saveAuthAppearanceAdmin } from "../../../services/siteAppearance";
import { useStaff } from "../../../context/StaffContext";
import { pendingStaffOperation, staffOperationActor } from "../../../services/staffOperations";
import SourceStatus from "../../../components/common/SourceStatus";
import { reconcileAdminOperation, adminError } from "../../../services/admin";

export default function Appearance() {
  const { staff, uid } = useStaff();
  const lock = useRef(false);
  const [pending, setPending] = useState(() => pendingStaffOperation(staffOperationActor(uid, staff.staffId), "siteAppearance")?.operationId || null);
  const [model, setModel] = useState(DEFAULT_AUTH_APPEARANCE);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  async function load() {
<<<<<<< HEAD
    setLoading(true); setError("");
    try { setModel(await loadAuthAppearanceAdmin()); } catch (requestError) { setError(adminError(requestError)); }
=======
    setLoading(true); setReady(false); setError("");
    try { setModel(await loadAuthAppearanceAdmin()); setReady(true); } catch (requestError) { setError(adminError(requestError)); }
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function save(event) {
<<<<<<< HEAD
    event.preventDefault(); setBusy(true); setNotice(""); setError("");
    try { await saveAuthAppearanceAdmin(model); setNotice("Authentication appearance saved."); }
    catch (requestError) { setError(adminError(requestError)); }
    finally { setBusy(false); }
  }
  async function reset() {
    if (!window.confirm("Reset the authentication hero image and presentation copy to the built-in defaults?")) return;
    setBusy(true); setNotice(""); setError("");
    try { await resetAuthAppearanceAdmin(); setModel(DEFAULT_AUTH_APPEARANCE); setNotice("Authentication appearance reset to default."); }
    catch (requestError) { setError(adminError(requestError)); }
    finally { setBusy(false); }
  }
  return <div className="admin-stack">
    <header className="admin-page-heading"><div><p className="admin-eyebrow">Website content</p><h1>Website Appearance</h1><p>Control approved customer-facing imagery without changing page structure or authentication logic.</p></div></header>
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    {error && <p className="admin-notice" role="alert">{error}</p>}
    <section className="admin-panel admin-stack" aria-labelledby="auth-appearance-title">
      <div><h2 id="auth-appearance-title">Authentication hero</h2><p>This visual appears across Sign In, Create Account, verification and password recovery. Text and photography remain separate layers.</p></div>
      {loading ? <p role="status">Loading appearance…</p> : <form className="admin-stack" onSubmit={save}>
        <fieldset className="admin-form-fields" disabled={busy || uploading}>
=======
    event.preventDefault(); if (lock.current || pending || !ready) return; lock.current = true; setBusy(true); setNotice(""); setError("");
    try { await saveAuthAppearanceAdmin(model); setNotice("Authentication appearance saved."); await load(); }
    catch (requestError) { setError(adminError(requestError)); if (requestError.code === "outcome-unknown") setPending(requestError.operationId); }
    finally { lock.current = false; setBusy(false); }
  }
  async function reset() {
    if (!ready || pending || lock.current) return;
    if (!window.confirm("Reset the authentication hero image and presentation copy to the built-in defaults?")) return;
    if (lock.current || pending) return; lock.current = true;
    setBusy(true); setNotice(""); setError("");
    try { await resetAuthAppearanceAdmin(model); setNotice("Authentication appearance reset to default as a new confirmed version."); await load(); }
    catch (requestError) { setError(adminError(requestError)); if (requestError.code === "outcome-unknown") setPending(requestError.operationId); }
    finally { lock.current = false; setBusy(false); }
  }
  async function check() {
    if (!pending || lock.current) return; lock.current = true; setBusy(true);
    try { const result = await reconcileAdminOperation(pending); if (result.state === "committed") { setPending(null); setNotice("The earlier appearance change is confirmed. No duplicate change was sent."); await load(); } else setError("The result remains unconfirmed. No repeat change is permitted."); }
    catch (reason) { setError(adminError(reason)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="admin-stack">
    <header className="admin-page-heading"><div><p className="admin-eyebrow">Website content</p><h1>Website Appearance</h1><p>Control approved customer-facing imagery without changing page structure or authentication logic.</p></div></header>
    {pending && <SourceStatus state={busy ? "checking-result" : "unknown-result"}>An earlier appearance change needs confirmation.<Button variant="secondary" disabled={busy} onClick={check}>Check outcome</Button></SourceStatus>}
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    {error && <p className="admin-notice" role="alert">{error}</p>}
    <Button variant="secondary" disabled={busy || uploading} onClick={load}>Reload current appearance</Button>
    <section className="admin-panel admin-stack" aria-labelledby="auth-appearance-title">
      <div><h2 id="auth-appearance-title">Authentication hero</h2><p>This visual appears across Sign In, Create Account, verification and password recovery. Text and photography remain separate layers.</p></div>
      {loading ? <p role="status">Loading appearance…</p> : <form className="admin-stack" onSubmit={save}>
        <fieldset className="admin-form-fields" disabled={busy || uploading || Boolean(pending) || !ready}>
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
          <div className="field"><label htmlFor="appearance-eyebrow">Small heritage label</label><input id="appearance-eyebrow" maxLength={80} required value={model.eyebrow || ""} onChange={(e) => setModel((m) => ({ ...m, eyebrow:e.target.value }))}/></div>
          <div className="field"><label htmlFor="appearance-headline">Hero headline</label><input id="appearance-headline" maxLength={120} required value={model.headline || ""} onChange={(e) => setModel((m) => ({ ...m, headline:e.target.value }))}/></div>
          <div className="field"><label htmlFor="appearance-support">Supporting text</label><textarea id="appearance-support" maxLength={260} required value={model.supportingText || ""} onChange={(e) => setModel((m) => ({ ...m, supportingText:e.target.value }))}/></div>
          <div className="field"><label className="field__label" htmlFor="appearance-auth-image">Authentication photograph</label><ImageField id="appearance-auth-image" value={model.image} onChange={(image) => setModel((m) => ({ ...m, image }))} setUploading={setUploading}/><p className="field__hint">Use Remove photo to clear the custom image. When no custom photo is saved, the built-in fashion image is used safely.</p></div>
        </fieldset>
<<<<<<< HEAD
        <div className="admin-form-actions"><Button type="submit" isLoading={busy} disabled={uploading}>Save appearance</Button><Button type="button" variant="secondary" disabled={busy || uploading} onClick={reset}>Reset to default</Button></div>
      </form>}
    </section>
    <section className="admin-panel admin-stack"><div><h2>Homepage hero photography</h2><p>The existing Homepage editor controls desktop/mobile hero photographs and copy. You can replace a photograph, remove it from a slide, or delete an entire hero slide.</p></div><Button to="/admin/homepage">Manage homepage hero</Button></section>
=======
        <div className="admin-form-actions"><Button type="submit" isLoading={busy} disabled={uploading || Boolean(pending) || !ready}>Save appearance</Button><Button type="button" variant="secondary" disabled={busy || uploading || Boolean(pending) || !ready} onClick={reset}>Reset to default</Button></div>
      </form>}
    </section>
    <section className="admin-panel admin-stack"><div><h2>Homepage hero photography</h2><p>The existing Homepage editor controls desktop/mobile hero photographs and copy. You can replace a photograph, remove it from a slide, and retain the slide while publication and history rules are reviewed.</p></div><Button to="/admin/homepage">Manage homepage hero</Button></section>
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
  </div>;
}
