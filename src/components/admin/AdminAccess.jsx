import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { signIn, signOutUser } from "../../firebase/auth";
import { isFirebaseConfigured } from "../../firebase/config";
import { checkAdmin, adminError } from "../../services/admin";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import Logo from "../brand/Logo";
import Button from "../common/Button";
import "../navigation/AdminLayout.css";

export default function AdminAccess({ children }) {
  const { user, isLoading } = useAuth();
  const [access, setAccess] = useState({ uid: null, allowed: false, checked: false });
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useDocumentMeta({ title: "Admin | Universal Dicta Couture", noindex: true });
  useEffect(() => {
    let current = true;
    if (user) {
      checkAdmin(user.uid).then(allowed => {
        if (current) setAccess({ uid: user.uid, allowed, checked: true });
      }).catch(error => {
        if (current) { setError(adminError(error)); setAccess({ uid: user.uid, allowed: false, checked: true }); }
      });
    }
    return () => { current = false; };
  }, [user, attempt]);
  async function login(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try { await signIn(String(form.get("email")).trim(), form.get("password")); }
    catch { setError("Unable to sign in. Check your email and password, then try again."); }
    finally { setBusy(false); }
  }
  async function logout() {
    setError(""); setBusy(true);
    try { await signOutUser(); setAccess({ uid: null, allowed: false, checked: false }); }
    catch { setError("Unable to sign out. Please try again."); }
    finally { setBusy(false); }
  }
  if (!isLoading && user && access.uid === user.uid && access.allowed) return children;
  const checking = isLoading || (user && (access.uid !== user.uid || !access.checked));
  return <main className="admin-access">
    <section className="admin-panel admin-access__card">
      <Logo />
      <p className="admin-eyebrow">The studio / Administration</p>
      <h1>{checking ? "Checking your access" : user ? "Admin access required" : "Welcome back"}</h1>
      {!isFirebaseConfigured ? <p>Admin sign-in is not connected yet. Complete the Firebase setup in the admin setup guide to get started.</p>
        : checking ? <p role="status">Please wait while we check your session.</p>
        : user ? <>
          <p>This account does not currently have verified admin access. Ask the site owner to enable your account.</p>
          <div className="admin-actions"><Button onClick={() => { setError(""); setAccess({ uid: null, allowed: false, checked: false }); setAttempt(v => v + 1); }}>Check again</Button>
          <Button variant="secondary" isLoading={busy} onClick={logout}>Sign out</Button></div>
        </> : <>
          <p>Sign in to manage your collection and website.</p>
          <form className="admin-stack" onSubmit={login}>
            <div className="field"><label htmlFor="admin-email">Email address</label><input id="admin-email" name="email" type="email" autoComplete="username" required /></div>
            <div className="field"><label htmlFor="admin-password">Password</label><input id="admin-password" name="password" type="password" autoComplete="current-password" required /></div>
            <Button type="submit" isLoading={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
          </form>
        </>}
      {error && <p className="field__error" role="alert">{error}</p>}
      <Button to="/" variant="ghost">Back to the website</Button>
    </section>
  </main>;
}
