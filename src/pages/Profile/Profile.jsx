import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { signIn, signOutUser, signUp } from "../../firebase/auth";
import { isFirebaseConfigured } from "../../firebase/config";
import {
  refreshAccountVerification,
  requestPasswordReset,
  sendAccountVerification,
} from "../../firebase/accountActions";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import Button from "../../components/common/Button";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import "./Profile.css";

function accountError(error) {
  switch (error.code) {
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/email-already-in-use":
      return "An account already uses that email. Please sign in or reset your password.";
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "The email or password is incorrect. Please try again.";
    case "auth/weak-password":
      return "Choose a password with at least six characters.";
    case "auth/password-does-not-meet-requirements":
      return "Use a longer password with upper and lowercase letters, a number and a symbol.";
    case "auth/operation-not-allowed":
      return "Email sign-in is not available yet. Please contact us.";
    case "auth/too-many-requests":
      return "There have been too many attempts. Please wait a little and try again.";
    case "auth/network-request-failed":
      return "Please check your connection and try again.";
    case "auth/requires-recent-login":
      return "Please sign out and sign in again, then retry.";
    default:
      return "We could not complete that request. Please try again.";
  }
}

export default function Profile() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const creating = location.pathname === "/signup";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resetting, setResetting] = useState(false);
  const [verifiedAccount, setVerifiedAccount] = useState(null);
  const emailVerified = Boolean(user?.emailVerified || (
    verifiedAccount?.uid === user?.uid && verifiedAccount?.verified
  ));
  const returnTo = location.state?.returnTo === "/chats" ? "/chats" : "/profile";
  const returnState = returnTo === "/chats" && typeof location.state?.draft === "string"
    ? { draft: location.state.draft }
    : undefined;

  useDocumentMeta({
    title: `${resetting ? "Reset password" : creating ? "Create account" : "Your account"} | Universal Dicta Couture`,
    noindex: true,
  });

  function clearFeedback() {
    setError("");
    setNotice("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy || !isFirebaseConfigured) return;
    clearFeedback();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const name = String(form.get("name") || "").trim();

    if (creating && !resetting && !name) {
      setError("Please enter your name.");
      return;
    }
    if (creating && !resetting && password !== form.get("confirmPassword")) {
      setError("Your passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      if (resetting) {
        await requestPasswordReset(email);
        setNotice("If an account uses that email, you will receive a password reset link. Please check your inbox and spam folder.");
      } else if (creating) {
        await signUp(email, password, name);
      } else {
        await signIn(email, password);
      }
    } catch (requestError) {
      setError(accountError(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function handleAccountAction(action) {
    if (busy) return;
    clearFeedback();
    setBusy(true);
    try {
      if (action === "signout") {
        await signOutUser();
        setVerifiedAccount(null);
      } else if (action === "verify") {
        await sendAccountVerification(user);
        setNotice("A verification link has been sent to your email. Check your inbox and spam folder, then return here after opening the link.");
      } else {
        const verified = await refreshAccountVerification(user);
        setVerifiedAccount({ uid: user.uid, verified });
        setNotice(verified
          ? "Your email address is verified."
          : "Your email is not verified yet. Open the verification link in your inbox, then check again.");
      }
    } catch (requestError) {
      setError(accountError(requestError));
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <LoadingSpinner />;
  if (user && !busy && location.pathname !== "/profile") {
    return <Navigate to={returnTo} state={returnState} replace />;
  }

  return (
    <section className="account-page container">
      <div className="account-card">
        <p className="text-secondary">Universal Dicta Couture</p>
        <h1>{user ? "Your account" : resetting ? "Reset your password" : creating ? "Create your account" : "Welcome back"}</h1>

        {user ? (
          <>
            <p>Signed in as <strong>{user.email}</strong></p>
            <div className="account-actions">
              <Button to="/shop">Browse Shop</Button>
              <Button to="/my-closet/my-pieces" variant="secondary">My Pieces</Button>
              <Button to="/chats" variant="secondary">My messages</Button>
              <Button to="/my-closet" variant="secondary">My Closet</Button>
            </div>
            <div className="account-form">
              <p>{emailVerified ? "Email verified" : "Verify your email to keep your account details up to date."}</p>
              {!emailVerified && (
                <div className="account-actions">
                  <Button type="button" disabled={busy} onClick={() => handleAccountAction("verify")}>Send verification email</Button>
                  <Button type="button" variant="ghost" disabled={busy} onClick={() => handleAccountAction("refresh")}>Check verification</Button>
                </div>
              )}
            </div>
            <div className="account-actions">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => handleAccountAction("signout")}>{busy ? "Please wait…" : "Sign out"}</Button>
            </div>
          </>
        ) : (
          <>
            <p>{resetting
              ? "Enter the email address for your account and we will send a link to choose a new password."
              : creating
                ? "Create an account to save your favourite pieces and keep your conversations with us together."
                : "Sign in to your account to continue your Universal Dicta Couture experience."}</p>
            {!isFirebaseConfigured && <p role="alert">Account access is temporarily unavailable. Please try again later.</p>}
            <form key={`${location.pathname}-${resetting}`} className="account-form" onSubmit={handleSubmit}>
              <fieldset className="account-form" disabled={busy || !isFirebaseConfigured}>
                {creating && !resetting && (
                  <label className="field">Name<input name="name" required maxLength={100} autoComplete="name" /></label>
                )}
                <label className="field">Email address<input name="email" type="email" required autoComplete="email" /></label>
                {!resetting && (
                  <label className="field">Password<input name="password" type="password" required minLength={creating ? 6 : undefined} autoComplete={creating ? "new-password" : "current-password"} /></label>
                )}
                {creating && !resetting && (
                  <label className="field">Confirm password<input name="confirmPassword" type="password" required minLength={6} autoComplete="new-password" /></label>
                )}
                <Button type="submit" disabled={busy || !isFirebaseConfigured}>{busy ? "Please wait…" : resetting ? "Send reset link" : creating ? "Create account" : "Sign in"}</Button>
              </fieldset>
            </form>
            {!creating && (
              <div className="account-actions">
                <Button type="button" variant="ghost" disabled={busy} onClick={() => { setResetting(!resetting); clearFeedback(); }}>
                  {resetting ? "Back to sign in" : "Forgot your password?"}
                </Button>
              </div>
            )}
            <p>{creating ? "Already have an account? " : "New to Universal Dicta Couture? "}
              <Link to={creating ? "/signin" : "/signup"} state={location.state} onClick={() => { setResetting(false); clearFeedback(); }}>
                {creating ? "Sign in" : "Create an account"}
              </Link>
            </p>
          </>
        )}
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert">{error}</p>}
      </div>
    </section>
  );
}
