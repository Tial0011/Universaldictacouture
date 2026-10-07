import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { signIn, signOutUser } from "../../firebase/auth";
import { isFirebaseConfigured } from "../../firebase/config";
import { watchStaffAccess, adminError } from "../../services/admin";
import { currentStaff, staffFingerprint } from "../../services/staffAuthorization";
import { StaffContext } from "../../context/StaffContext";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import Logo from "../brand/Logo";
import Button from "../common/Button";
import { runtimeErrorState, runtimeStateMessage } from "../../services/operationalRuntime";
import AdminIcon from "./AdminIcon";
import OperationalState from "./OperationalState";
import "../navigation/AdminLayout.css";
import "./AdminVisual.css";

export default function AdminAccess({ children }) {
  const { user, isLoading } = useAuth();
  const framed = window.self !== window.top;
  const uid = user?.uid;
  const [access, setAccess] = useState({ uid: null, staff: null, checked: false });
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  useDocumentMeta({ title: "Admin | Universal Dicta Couture", noindex: true });
  useEffect(() => {
    let current = true;
    const stop = uid && !framed ? watchStaffAccess(uid, (staff, state = "verified") => {
      if (current) { setError(""); setAccess({ uid, staff, state, checked: state !== "checking" }); }
    }, error => {
      if (current) { setError(adminError(error)); setAccess({ uid, staff: null, state: runtimeErrorState(error), checked: true }); }
    }) : undefined;
    return () => { current = false; stop?.(); };
  }, [uid, attempt, framed]);
  async function login(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setPasswordVisible(false);
    try { await signIn(String(form.get("email")).trim(), form.get("password")); }
    catch { setError("Unable to sign in. Check your email and password, then try again."); }
    finally { setBusy(false); }
  }
  async function logout() {
    setError(""); setBusy(true);
    try { await signOutUser(); setAccess({ uid: null, staff: null, checked: false }); }
    catch { setError("Unable to sign out. Please try again."); }
    finally { setBusy(false); }
  }
  if (framed) return <main className="admin-access"><section className="admin-panel admin-access__card"><h1>Open the private workspace in its own window</h1><p>Staff work is not available inside an embedded page. No protected staff context has been opened.</p><Button href="/admin" target="_blank" rel="noopener noreferrer">Open staff workspace</Button></section></main>;
  if (!isLoading && user && access.uid === user.uid && currentStaff(access.staff)) return <StaffContext.Provider
    key={user.uid + staffFingerprint(access.staff)} value={{ staff: access.staff, uid: user.uid }}>{children}</StaffContext.Provider>;
  const checking = isLoading || (user && (access.uid !== user.uid || !access.checked));
  const entryState = checking ? "checking" : user ? access.state === "connection-problem" || access.state === "source-unavailable" ? access.state : access.state === "verified" && access.staff?.active === false ? "inactive" : access.state === "verified" && !access.staff ? "unresolved" : "restricted" : "sign-in";
  return <main className="admin-access" data-entry-state={entryState}>
    <aside className="admin-access__brand" aria-label="Universal Dicta Couture staff workspace"><Logo variant="white" /><div><p className="admin-eyebrow">Private staff environment</p><h2>Operational atelier</h2><p>Current staff access is checked before protected work opens.</p></div></aside>
    <div className="admin-access__workspace"><section className="admin-panel admin-access__card" aria-labelledby="admin-entry-title">
      <div className="admin-access__identity"><Logo /><p className="admin-eyebrow">Administration</p></div>
      <h1 id="admin-entry-title">{checking ? "Checking your staff access" : user ? "Staff access unavailable" : "Staff sign-in"}</h1>
      {!isFirebaseConfigured ? <p>Admin sign-in is not connected yet. Complete the Firebase setup in the admin setup guide to get started.</p>
        : checking ? <OperationalState state="checking" message="Please wait while we check your current session and Staff Access." />
        : user ? <>
          <OperationalState state={entryState} message={access.state === "connection-problem" ? runtimeStateMessage("connection-problem") : access.state === "source-unavailable" ? "Current staff authority source is unavailable. This is not an inactive-membership conclusion." : entryState === "inactive" ? "Current staff access is inactive. Protected work is unavailable." : entryState === "unresolved" ? "Current staff account context could not be established. No protected work has been opened." : "Current staff identity/access is restricted or inactive. Protected work is unavailable until current access is established."} />
          <div className="admin-actions"><Button onClick={() => { setError(""); setAccess({ uid: null, staff: null, checked: false }); setAttempt(v => v + 1); }}>Check again</Button>
          <Button variant="secondary" isLoading={busy} onClick={logout}>Sign out</Button></div>
        </> : <>
          <p className="admin-access__intro">Internal access for authorized UDC staff.</p>
          <form className="admin-stack" onSubmit={login} aria-busy={busy || undefined}>
            <div className="field"><label htmlFor="admin-email">Email address</label><input id="admin-email" name="email" type="email" autoComplete="username" required aria-describedby={error ? "admin-login-error" : undefined} /></div>
            <div className="field"><label htmlFor="admin-password">Password</label><div className="admin-password-control"><input id="admin-password" name="password" type={passwordVisible ? "text" : "password"} autoComplete="current-password" required aria-describedby={error ? "admin-login-error" : undefined} /><button type="button" className="admin-password-toggle" aria-label={passwordVisible ? "Hide password" : "Show password"} aria-pressed={passwordVisible} aria-controls="admin-password" onClick={() => setPasswordVisible(value => !value)}><AdminIcon name={passwordVisible ? "eye-off" : "eye"} /></button></div></div>
            <Button type="submit" isLoading={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
          </form>
          <div className="admin-access__privacy"><AdminIcon name="shield" /><p>For individually authorized staff only. Sign-in does not grant operational authority.</p></div>
        </>}
      {error && <p id="admin-login-error" className="field__error admin-access__error" role="alert">{error}</p>}
      <Button to="/" variant="ghost">Back to the website</Button>
    </section></div>
  </main>;
}
