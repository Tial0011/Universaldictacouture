import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { signIn, signUp, signOutUser } from "../../firebase/auth";
import { isFirebaseConfigured } from "../../firebase/config";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import Button from "../../components/common/Button";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import "./Profile.css";

export default function Profile() {
  const { user, isLoading } = useAuth();
  const { pathname } = useLocation();
  const creating = pathname === "/signup";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useDocumentMeta({ title: (creating ? "Create account" : "Your account") + " | Universal Dicta Couture", noindex: true });
  async function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email")).trim();
    const password = String(data.get("password"));
    const name = String(data.get("name") || "").trim();
    if (creating && !name) { setError("Enter your name."); return; }
    if (creating && password !== data.get("confirm")) { setError("The passwords do not match."); return; }
    setError(""); setBusy(true);
    try {
      if (creating) await signUp(email, password, name);
      else await signIn(email, password);
    } catch (error) {
      const messages = {
        "auth/email-already-in-use": "An account already uses this email. Please sign in.",
        "auth/weak-password": "Choose a stronger password with at least 6 characters.",
        "auth/password-does-not-meet-requirements": "Your password does not meet the account security requirements. Use a longer password with upper and lowercase letters, a number and a symbol.",
        "auth/invalid-email": "Enter a valid email address.",
        "auth/operation-not-allowed": "Email sign-in is not available yet. Please contact us.",
        "auth/too-many-requests": "Too many attempts. Please wait and try again.",
        "auth/network-request-failed": "Check your internet connection and try again.",
      };
      setError(messages[error.code] || "Unable to continue. Check your details and try again.");
    } finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError("");
    try { await signOutUser(); } catch { setError("Unable to sign out. Please try again."); }
    finally { setBusy(false); }
  }
  if (isLoading) return <LoadingSpinner label="Checking your account" />;
  if (user && !busy && pathname !== "/profile") return <Navigate to="/profile" replace />;
  return <section className="account-page container">
    <div className="account-card">
      <p className="text-secondary">Universal Dicta Couture</p>
      <h1>{user ? "Your account" : creating ? "Create your account" : "Welcome back"}</h1>
      {user ? <>
        <p>Signed in as <strong>{user.email}</strong>.</p>
        <div className="account-actions"><Button to="/shop">Browse the shop</Button><Button to="/saved-pieces" variant="secondary">Saved pieces</Button><Button to="/my-closet" variant="secondary">My Closet</Button></div>
        <Button variant="ghost" isLoading={busy} onClick={logout}>Sign out</Button>
      </> : <>
        <p>{creating ? "Create an account to keep your saved pieces across visits." : "Sign in to access your saved pieces."}</p>
        {!isFirebaseConfigured && <p role="alert">Account access is temporarily unavailable. Please try again later.</p>}
        <form onSubmit={submit} key={pathname} className="account-form">
          <fieldset disabled={busy || !isFirebaseConfigured} className="account-form">
            {creating && <div className="field"><label htmlFor="customer-name">Your name</label><input id="customer-name" name="name" autoComplete="name" required maxLength={100} /></div>}
            <div className="field"><label htmlFor="customer-email">Email address</label><input id="customer-email" name="email" type="email" autoComplete="email" required /></div>
            <div className="field"><label htmlFor="customer-password">Password</label><input id="customer-password" name="password" type="password" autoComplete={creating ? "new-password" : "current-password"} required minLength={creating ? 6 : undefined} />{creating && <p className="field__hint">Use at least 6 characters.</p>}</div>
            {creating && <div className="field"><label htmlFor="customer-confirm">Confirm password</label><input id="customer-confirm" name="confirm" type="password" autoComplete="new-password" required minLength={6} /></div>}
            <Button type="submit" isLoading={busy}>{busy ? "Please wait…" : creating ? "Create account" : "Sign in"}</Button>
          </fieldset>
        </form>
        <p>{creating ? "Already have an account? " : "New here? "}<Link onClick={() => setError("")} to={creating ? "/signin" : "/signup"}>{creating ? "Sign in" : "Create an account"}</Link></p>
      </>}
      {error && <p className="field__error" role="alert">{error}</p>}
    </div>
  </section>;
}
