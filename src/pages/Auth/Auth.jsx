import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Button from "../../components/common/Button";
import AuthShell from "../../components/auth/AuthShell";
import { useAuth } from "../../context/AuthContext";
import { changePendingEmail, signIn, signOutUser, signUp, updateAccountName } from "../../firebase/auth";
import {
  actionCodeSettings,
  applyEmailVerificationCode,
  inspectPasswordResetCode,
  refreshAccountVerification,
  requestPasswordReset,
  sendAccountVerification,
  setPasswordFromResetCode,
} from "../../firebase/accountActions";
import { isFirebaseConfigured } from "../../firebase/config";
import { saveCustomerProfile } from "../../services/customerProfile";
import {
  clearKeepSignedInPreference,
  maskEmail,
  readKeepSignedInPreference,
  rememberKeepSignedInPreference,
  safeReturnPath,
} from "../../services/authFlow";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import "./Auth.css";

const COOLDOWN_SECONDS = 60;

function accountError(error) {
  switch (error?.code) {
    case "auth/invalid-email": return "Enter a valid email address.";
    case "auth/email-already-in-use": return "An account already uses that email. Please sign in or reset your password.";
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/user-not-found":
    case "auth/wrong-password": return "We couldn’t sign you in with those details.";
    case "auth/weak-password": return "Choose a password with at least six characters.";
    case "auth/password-does-not-meet-requirements": return "Use a stronger password and try again.";
    case "auth/too-many-requests": return "Please wait a little before trying again.";
    case "auth/quota-exceeded": return "Please try again shortly. We’re temporarily unable to send another email right now. Please try again in about an hour.";
    case "auth/network-request-failed": return "We couldn’t reach the network. Check your connection and try again.";
    case "auth/expired-action-code": return "This secure link has expired. Request a new link to continue.";
    case "auth/invalid-action-code": return "This secure link is invalid or has already been used. Request a new link to continue.";
    case "auth/requires-recent-login": return "For your security, please sign in again before changing this detail.";
    default: return error?.message && !String(error.message).includes("Firebase") ? error.message : "We could not complete that request. Please try again.";
  }
}

function PasswordField({ id, label, name, autoComplete, required = true, minLength }) {
  const [visible, setVisible] = useState(false);
  return <div className="auth-field">
    <label htmlFor={id}>{label}</label>
    <div className="auth-control-wrap">
      <input id={id} name={name} type={visible ? "text" : "password"} required={required} minLength={minLength} autoComplete={autoComplete} aria-describedby={minLength ? id + "-hint" : undefined} />
      <button className="auth-password-toggle" type="button" aria-label={(visible ? "Hide " : "Show ") + label.toLowerCase()} aria-pressed={visible} onClick={() => setVisible((value) => !value)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{visible && <path d="m3 3 18 18"/>}</svg>
      </button>
    </div>
    {minLength && <p id={id + "-hint"} className="auth-field__hint">{name === "confirmPassword" ? "Enter the same password again." : "Use at least six characters."}</p>}
  </div>;
}

function FlowIntro({ mark = "◆", eyebrow = "PRIVATE CLIENT ACCESS", title, children }) {
  return <div className="auth-flow__intro"><span className="auth-flow__mark" aria-hidden="true">{mark}</span><p className="auth-flow__eyebrow">{eyebrow}</p><h1>{title}</h1><div className="auth-flow__rule" aria-hidden="true">◆</div><p>{children}</p></div>;
}

function useCooldown(initialSeconds = 0) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const coolingDown = seconds > 0;
  useEffect(() => {
    if (!coolingDown) return undefined;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [coolingDown]);
  return [seconds, () => setSeconds(COOLDOWN_SECONDS)];
}

export default function Auth() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const path = location.pathname;
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const actionContinueReturn = useMemo(() => {
    const continueUrl = params.get("continueUrl");
    if (!continueUrl) return "";
    try {
      const url = new URL(continueUrl, window.location.origin);
      if (url.origin !== window.location.origin) return "";
      return url.searchParams.get("returnTo") || "";
    } catch { return ""; }
  }, [params]);
  const returnTo = safeReturnPath(location.state?.returnTo || params.get("returnTo") || actionContinueReturn || "/profile", "/profile");
  const returnState = location.state?.returnState || null;
  const sessionExpired = Boolean(location.state?.sessionExpired);
  const [busy, setBusy] = useState(false);
  const [credentialsPending, setCredentialsPending] = useState(false);
  const [error, setError] = useState(() => path === "/reset-password" && !params.get("oobCode") ? "This reset link is incomplete. Request a new link to continue." : "");
  const [notice, setNotice] = useState(location.state?.verificationNotice || "");
  const [pendingSetup, setPendingSetup] = useState(null);
  const actionRequest = useRef(null);
  const [keepSignedIn, setKeepSignedIn] = useState(readKeepSignedInPreference);
  const [sentEmail, setSentEmail] = useState("");
  const [changeEmail, setChangeEmail] = useState(false);
  const [resetValid, setResetValid] = useState(path === "/reset-password" && !params.get("oobCode") ? false : null);
  const [resetEmail, setResetEmail] = useState("");
  const [completed, setCompleted] = useState("");
  const [cooldown, startCooldown] = useCooldown(location.state?.verificationSent ? COOLDOWN_SECONDS : 0);
  const actionMode = params.get("mode");
  const actionCode = params.get("oobCode");

  useDocumentMeta({ title: `${path === "/signup" ? "Create account" : path.includes("reset") || path === "/forgot-password" ? "Account recovery" : path === "/verify-email" ? "Verify email" : "Sign in"} | Universal Dicta Couture`, noindex: true });

  useEffect(() => {
    if (path !== "/auth/action") return;
    let active = true;
    async function handleAction() {
      setBusy(true); setError("");
      try {
        if (actionMode === "verifyEmail" || actionMode === "verifyAndChangeEmail") {
          if (actionRequest.current?.code !== actionCode) {
            actionRequest.current = { code: actionCode, promise: applyEmailVerificationCode(actionCode) };
          }
          await actionRequest.current.promise;
          if (user) { try { await saveCustomerProfile(user, {}); } catch { /* Verification itself succeeded; profile sync can retry later. */ } }
          if (active) setCompleted("verified");
        } else if (actionMode === "resetPassword") {
          navigate(`/reset-password?oobCode=${encodeURIComponent(actionCode || "")}`, { replace: true, state: { returnTo, returnState } });
        } else {
          throw new Error("This account link is not supported.");
        }
      } catch (requestError) { if (active) setError(accountError(requestError)); }
      finally { if (active) setBusy(false); }
    }
    void handleAction();
    return () => { active = false; };
  }, [path, actionMode, actionCode, navigate, returnTo, returnState, user]);

  useEffect(() => {
    if (path !== "/reset-password") return;
    if (!actionCode) return;
    let active = true;
    inspectPasswordResetCode(actionCode).then((email) => { if (active) { setResetEmail(email); setResetValid(true); } }).catch((requestError) => { if (active) { setResetValid(false); setError(accountError(requestError)); } });
    return () => { active = false; };
  }, [path, actionCode]);

  function finishAuth() {
    clearKeepSignedInPreference();
    navigate(returnTo, { replace: true, state: returnState || undefined });
  }

  async function submitSignIn(event) {
    event.preventDefault(); if (busy || !isFirebaseConfigured) return;
    setBusy(true); setCredentialsPending(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const credential = await signIn(String(form.get("email") || "").trim(), String(form.get("password") || ""), { keepSignedIn });
      if (location.state?.verifyAfterSignIn && !credential.user.emailVerified) {
        navigate("/verify-email", { replace: true, state: { returnTo, returnState } });
      } else finishAuth();
    } catch (requestError) { setError(accountError(requestError)); }
    finally { setBusy(false); setCredentialsPending(false); }
  }

  async function completeSetup(account, details) {
    try {
      await updateAccountName(account, details.fullName);
      await saveCustomerProfile(account, details);
    } catch {
      setPendingSetup({ account, details });
      setError("Your account was created, but we couldn’t save your details. Retry to finish setting it up.");
      return;
    }
    let verificationNotice = "";
    let verificationSent = false;
    try { await sendAccountVerification(account, returnTo); verificationSent = true; }
    catch (requestError) { verificationNotice = "Your account is ready. " + accountError(requestError); }
    navigate("/verify-email", { replace: true, state: { returnTo, returnState, verificationSent, verificationNotice } });
  }

  async function useAnotherAccount() {
    if (busy) return;
    setBusy(true); setError("");
    try { await signOutUser(); }
    catch (requestError) { setError(accountError(requestError)); }
    finally { setBusy(false); }
  }

  function returnToBrowsing() {
    navigate(["/profile", "/my-closet/saved-reviews"].includes(returnTo.split(/[?#]/)[0]) ? "/" : returnTo, { replace: true, state: returnState || undefined });
  }

  async function submitSignUp(event) {
    event.preventDefault(); if (busy || !isFirebaseConfigured) return;
    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("fullName") || "").trim();
    const phoneNumber = String(form.get("phoneNumber") || "").trim();
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const confirm = String(form.get("confirmPassword") || "");
    if (!fullName || !phoneNumber) return setError("Enter your full name and phone number.");
    if (password !== confirm) return setError("Your passwords do not match.");
    setBusy(true); setCredentialsPending(true); setError("");
    try {
      const credential = await signUp(email, password, { keepSignedIn });
      await completeSetup(credential.user, { fullName, phoneNumber });
    } catch (requestError) { setError(accountError(requestError)); }
    finally { setBusy(false); setCredentialsPending(false); }
  }

  async function submitForgot(event) {
    event.preventDefault(); if (busy) return;
    const email = String(new FormData(event.currentTarget).get("email") || "").trim();
    setBusy(true); setError("");
    try { await requestPasswordReset(email, returnTo); setSentEmail(email); startCooldown(); }
    catch (requestError) { setError(accountError(requestError)); }
    finally { setBusy(false); }
  }

  async function resendVerification() {
    if (!user || busy || cooldown) return;
    setBusy(true); setError(""); setNotice("");
    try { await sendAccountVerification(user, returnTo); startCooldown(); setNotice("Verification email sent. Check your inbox and spam folder."); }
    catch (requestError) { setError(accountError(requestError)); }
    finally { setBusy(false); }
  }

  async function refreshVerification() {
    if (!user || busy) return;
    setBusy(true); setError("");
    try { const verified = await refreshAccountVerification(user); if (verified) setCompleted("verified"); else setNotice("Your email is not verified yet. Open the link from your email, then check again."); }
    catch (requestError) { setError(accountError(requestError)); }
    finally { setBusy(false); }
  }

  async function submitEmailChange(event) {
    event.preventDefault(); if (!user || busy) return;
    const email = String(new FormData(event.currentTarget).get("newEmail") || "").trim();
    setBusy(true); setError("");
    try { await changePendingEmail(user, email, actionCodeSettings(returnTo)); setChangeEmail(false); startCooldown(); setNotice(`We sent a secure confirmation link to ${maskEmail(email)}. Your account email changes only after you verify it.`); }
    catch (requestError) { setError(accountError(requestError)); }
    finally { setBusy(false); }
  }

  async function submitNewPassword(event) {
    event.preventDefault(); if (busy || !resetValid) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    if (password !== String(form.get("confirmPassword") || "")) return setError("Your passwords do not match.");
    setBusy(true); setError("");
    try { await setPasswordFromResetCode(actionCode, password); rememberKeepSignedInPreference(keepSignedIn); setCompleted("password"); }
    catch (requestError) { setError(accountError(requestError)); }
    finally { setBusy(false); }
  }

  if (isLoading) return <AuthShell><div className="auth-flow"><p role="status">Checking your account…</p></div></AuthShell>;

  if (pendingSetup) return <AuthShell><div className="auth-flow"><FlowIntro title="Let’s finish your account" eyebrow="ACCOUNT CREATED">Your sign-in details are ready. One more step will save your name and phone number.</FlowIntro>{error && <p role="alert" className="auth-flow__status">{error}</p>}<Button isLoading={busy} onClick={async () => { setBusy(true); setError(""); try { await completeSetup(pendingSetup.account, pendingSetup.details); } finally { setBusy(false); } }}>RETRY ACCOUNT SETUP →</Button></div></AuthShell>;

  if (completed === "verified") return <AuthShell><div className="auth-flow auth-success"><FlowIntro mark="✓" eyebrow="ACCOUNT VERIFIED" title="Email Verified">Welcome to Universal Dicta Couture. More Than Fashion. A Heritage You Wear.</FlowIntro><div className="auth-flow__actions"><Button onClick={user ? finishAuth : () => navigate("/signin", { state: { returnTo, returnState } })}>CONTINUE →</Button></div></div></AuthShell>;
  if (completed === "password") return <AuthShell><div className="auth-flow auth-success"><FlowIntro mark="✓" eyebrow="SECURE ACCOUNT RECOVERY" title="Password Updated">Welcome back to Universal Dicta Couture. Your new password has been set successfully.</FlowIntro><div className="auth-flow__actions"><Button to="/signin" state={{ returnTo, returnState }}>SIGN IN →</Button></div></div></AuthShell>;

  if ((path === "/signin" || path === "/signup") && user && !credentialsPending) return <AuthShell><div className="auth-flow auth-success"><FlowIntro mark="●" eyebrow="ACCOUNT ACTIVE" title="You’re already signed in">Your account is already active on this device.</FlowIntro>{error && <p role="alert" className="auth-flow__status">{error}</p>}<div className="auth-flow__actions"><Button onClick={finishAuth}>CONTINUE →</Button><Button variant="secondary" disabled={busy} onClick={useAnotherAccount}>USE ANOTHER ACCOUNT</Button><Button variant="ghost" onClick={returnToBrowsing}>BACK</Button></div></div></AuthShell>;

  if (path === "/auth/action") return <AuthShell><div className="auth-flow"><FlowIntro title="Secure account link">We’re validating your Universal Dicta Couture account link.</FlowIntro>{busy && <p role="status">Please wait…</p>}{error && <><p className="auth-flow__status" role="alert">{error}</p><Button to={actionMode === "resetPassword" ? "/forgot-password" : "/verify-email"} state={{ returnTo, returnState }}>Request a fresh link</Button></>}</div></AuthShell>;

  if (path === "/account-unavailable") return <AuthShell><div className="auth-flow auth-success"><FlowIntro mark="⌁" eyebrow="PRIVATE CUSTOMER AREA" title="This page is unavailable for this account.">The link may be private, unavailable, or no longer active. For your privacy, access cannot be granted from this account.</FlowIntro><div className="auth-flow__actions"><Button to={user ? "/profile" : "/signin"} state={!user ? { returnTo: "/profile" } : undefined}>GO TO PROFILE →</Button><Button to="/chats" variant="secondary">OPEN CHATS</Button><Button variant="ghost" onClick={returnToBrowsing}>BACK</Button></div></div></AuthShell>;

  if (path === "/verify-email") {
    if (!user) return <AuthShell><div className="auth-flow"><FlowIntro title="Verify your email">Sign in to continue your email verification.</FlowIntro><Button to="/signin" state={{ returnTo, returnState, verifyAfterSignIn: true }}>SIGN IN →</Button></div></AuthShell>;
    if (user.emailVerified) return <AuthShell><div className="auth-flow"><FlowIntro mark="✓" title="Your email is verified">Your account is ready.</FlowIntro><Button onClick={finishAuth}>CONTINUE →</Button></div></AuthShell>;
    return <AuthShell><div className="auth-flow"><FlowIntro mark="✉" eyebrow="ONE SECURE STEP" title="Verify your email">{location.state?.verificationSent ? "We’ve sent a verification link to " : "Send a verification link to "}<span className="auth-flow__email">{maskEmail(user.email)}</span>. Open the email and tap the verification link to finish creating your account.</FlowIntro>
      {notice && <p className="auth-flow__status auth-flow__status--success" role="status">{notice}</p>}{error && <p className="auth-flow__status" role="alert">{error}</p>}
      {changeEmail ? <form className="auth-flow__form" aria-busy={busy} onSubmit={submitEmailChange}><div className="auth-field"><label htmlFor="verify-new-email">New email address</label><input id="verify-new-email" name="newEmail" type="email" required autoComplete="email"/></div><div className="auth-flow__actions"><Button type="submit" isLoading={busy}>UPDATE & SEND LINK</Button><Button variant="secondary" onClick={() => setChangeEmail(false)}>CANCEL</Button></div></form> : <div className="auth-flow__actions"><Button disabled={busy || cooldown > 0} onClick={resendVerification}>{cooldown ? `RESEND EMAIL IN ${cooldown}s` : location.state?.verificationSent || notice.startsWith("Verification email sent") ? "RESEND EMAIL →" : "SEND VERIFICATION EMAIL →"}</Button><Button variant="secondary" onClick={() => setChangeEmail(true)}>CHANGE EMAIL</Button><Button variant="ghost" disabled={busy} onClick={refreshVerification}>I’VE VERIFIED — CHECK AGAIN</Button><Button variant="ghost" onClick={returnToBrowsing}>BACK</Button></div>}
      <p className="auth-flow__fineprint">Verification links are secure and time-limited. If sending is temporarily limited, wait for the cooldown and try again.</p></div></AuthShell>;
  }

  if (path === "/forgot-password") return <AuthShell><div className="auth-flow"><FlowIntro mark="⌁" eyebrow="SECURE RECOVERY" title="Forgot your password?">Enter the email linked to your account and we’ll send you a secure reset link.</FlowIntro>
    {!sentEmail ? <form className="auth-flow__form" onSubmit={submitForgot}><div className="auth-field"><label htmlFor="forgot-email">Email</label><input id="forgot-email" name="email" type="email" required autoComplete="email"/></div><Button type="submit" isLoading={busy}>SEND RESET LINK →</Button></form> : <div className="auth-flow auth-success"><p className="auth-flow__status auth-flow__status--success">If an account uses <strong>{maskEmail(sentEmail)}</strong>, you’ll receive a password reset link. Check your inbox and spam folder.</p><div className="auth-flow__actions"><Button onClick={() => navigate("/signin", { state: { returnTo, returnState } })}>GOT IT</Button><Button variant="secondary" onClick={() => { setSentEmail(""); setError(""); }}>CHANGE EMAIL</Button><Button variant="ghost" disabled={cooldown > 0 || busy} onClick={async () => { setBusy(true); try { await requestPasswordReset(sentEmail, returnTo); startCooldown(); } catch (requestError) { setError(accountError(requestError)); } finally { setBusy(false); } }}>{cooldown ? `RESEND EMAIL IN ${cooldown}s` : "RESEND EMAIL"}</Button></div></div>}
    {error && <p className="auth-flow__status" role="alert">{error}</p>}<p className="auth-flow__fineprint">For privacy, this page does not reveal whether an email address belongs to an account.</p><p className="auth-flow__switch"><Link to="/signin" state={{ returnTo, returnState }}>Back to Sign In</Link></p></div></AuthShell>;

  if (path === "/reset-password") return <AuthShell><div className="auth-flow"><FlowIntro mark="⌁" eyebrow="SECURE RECOVERY" title="Create New Password">Set a secure new password for your account{resetEmail ? ` (${maskEmail(resetEmail)})` : ""}.</FlowIntro>
    {resetValid === false && error ? <><p className="auth-flow__status" role="alert">{error}</p><Button to="/forgot-password" state={{ returnTo, returnState }}>REQUEST A NEW LINK</Button></> : resetValid ? <form className="auth-flow__form" onSubmit={submitNewPassword}><PasswordField id="new-password" name="password" label="New Password" minLength={6} autoComplete="new-password"/><PasswordField id="confirm-new-password" name="confirmPassword" label="Confirm New Password" minLength={6} autoComplete="new-password"/><label className="choice"><input type="checkbox" checked={keepSignedIn} onChange={(e) => setKeepSignedIn(e.target.checked)}/><span>Keep me signed in on this device</span></label><Button type="submit" isLoading={busy}>SET NEW PASSWORD →</Button>{error && <p className="auth-flow__status" role="alert">{error}</p>}</form> : <p role="status">Checking this secure reset link…</p>}
    <p className="auth-flow__switch"><Link to="/signin" state={{ returnTo, returnState }}>Back to Sign In</Link></p></div></AuthShell>;

  const creating = path === "/signup";
  const signInTitle = sessionExpired ? "Your Session Has Expired" : "Welcome back";
  const signInCopy = sessionExpired ? "Please sign in again to continue." : "Continue your Universal Dicta Couture experience.";
  return <AuthShell><div className="auth-flow"><FlowIntro mark={creating ? "◇" : sessionExpired ? "⌁" : "◆"} eyebrow={creating ? "JOIN THE HOUSE" : sessionExpired ? "SESSION ENDED" : "PRIVATE CLIENT ACCESS"} title={creating ? "Create your account" : signInTitle}>{creating ? "Start your Universal Dicta Couture experience." : signInCopy}</FlowIntro>
    {!isFirebaseConfigured && <p className="auth-flow__status" role="alert">Account access is temporarily unavailable. Please try again later.</p>}
    <form className={"auth-flow__form" + (creating ? " auth-flow__form--signup" : "")} aria-busy={busy} onSubmit={creating ? submitSignUp : submitSignIn}>
      {creating && <><div className="auth-field"><label htmlFor="auth-full-name">Full Name</label><input id="auth-full-name" name="fullName" required maxLength={100} autoComplete="name"/></div><div className="auth-field"><label htmlFor="auth-phone">Phone Number</label><input id="auth-phone" name="phoneNumber" type="tel" required maxLength={40} autoComplete="tel"/></div></>}
      <div className="auth-field"><label htmlFor="auth-email">Email</label><input id="auth-email" name="email" type="email" required autoComplete="email"/></div>
      <PasswordField id="auth-password" name="password" label="Password" minLength={creating ? 6 : undefined} autoComplete={creating ? "new-password" : "current-password"}/>
      {creating && <PasswordField id="auth-confirm" name="confirmPassword" label="Confirm Password" minLength={6} autoComplete="new-password"/>}
      <div className="auth-choice-row"><label className="choice"><input type="checkbox" checked={keepSignedIn} onChange={(e) => setKeepSignedIn(e.target.checked)}/><span>Keep me signed in on this device</span></label>{!creating && <Link to="/forgot-password" state={{ returnTo, returnState }}>Forgot password?</Link>}</div>
      <Button type="submit" disabled={busy || !isFirebaseConfigured} isLoading={busy}>{creating ? "CREATE ACCOUNT →" : "SIGN IN →"}</Button>
      {error && <p className="auth-flow__status" role="alert">{error}</p>}
    </form>
    {creating && <p className="auth-flow__fineprint">By creating an account, you agree to our <Link to="/policies">Terms</Link> and acknowledge our <Link to="/policies">Privacy Policy</Link>. Style Circle marketing remains a separate choice.</p>}
    <p className="auth-flow__switch">{creating ? <>Already have an account? <Link to="/signin" state={{ returnTo, returnState }}>Sign In</Link></> : <>New here? <Link to="/signup" state={{ returnTo, returnState }}>Create Account</Link></>}</p>
    <div className="auth-flow__actions"><Button variant="ghost" onClick={returnToBrowsing}>BACK</Button></div>
    <p className="auth-flow__fineprint">You’ll return to where you left off after authentication. Your saved choices will be waiting for you.</p>
  </div></AuthShell>;
}
