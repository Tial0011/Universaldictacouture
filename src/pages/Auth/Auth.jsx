import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Button from "../../components/common/Button";
import AuthShell from "../../components/auth/AuthShell";
import { useAuth } from "../../context/AuthContext";
import { signIn, signOutUser, signUp } from "../../firebase/auth";
import {
  applyEmailVerificationCode,
  inspectEmailVerificationCode,
  inspectPasswordResetCode,
  refreshAccountVerification,
  requestPasswordReset,
  sendAccountVerification,
  setPasswordFromResetCode,
} from "../../firebase/accountActions";
import { isFirebaseConfigured } from "../../firebase/config";
import {
  clearKeepSignedInPreference,
  maskEmail,
  safeReturnPath,
  passwordPolicyError,
  authFailureMessage,
  continuationTarget,
} from "../../services/authFlow";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import "./Auth.css";

const COOLDOWN_SECONDS = 60;

function accountError(error) {
  return authFailureMessage(error);
}

function PasswordField({ id, label, name, autoComplete, required = true, minLength }) {
  const [visible, setVisible] = useState(false);
  return <div className="auth-field">
    <label htmlFor={id}>{label}</label>
    <div className="auth-control-wrap">
      <input id={id} name={name} type={visible ? "text" : "password"} required={required} minLength={minLength} autoComplete={autoComplete} aria-describedby={[minLength ? id + "-hint" : "", "auth-error"].filter(Boolean).join(" ")} />
      <button className="auth-password-toggle" type="button" aria-label={(visible ? "Hide " : "Show ") + label.toLowerCase()} aria-pressed={visible} onClick={() => setVisible((value) => !value)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{visible && <path d="m3 3 18 18"/>}</svg>
      </button>
    </div>
    {minLength && <p id={id + "-hint"} className="auth-field__hint">{name === "confirmPassword" ? "Enter the same password again." : "Use 15–64 characters. Paste and password managers are supported."}</p>}
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
  const { user, isLoading, sessionState, recheckSession } = useAuth();
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
  const returnTo = safeReturnPath(continuationTarget(location.state, user?.uid || "guest") || params.get("returnTo") || actionContinueReturn || "/profile", "/profile");
  const returnState = null;
  const sessionExpired = sessionState === "expired" || location.state?.sessionReason === "expired";
  const [busy, setBusy] = useState(false);
  const [credentialsPending, setCredentialsPending] = useState(false);
  const [error, setError] = useState(() => path === "/reset-password" && !params.get("oobCode") ? "This reset link is incomplete. Request a new link to continue." : "");
  const [notice, setNotice] = useState(location.state?.verificationNotice || "");
  const actionRequest = useRef(null);
  const [sentEmail, setSentEmail] = useState("");
  const [resetValid, setResetValid] = useState(path === "/reset-password" && !params.get("oobCode") ? false : null);
  const [resetEmail, setResetEmail] = useState("");
  const [completed, setCompleted] = useState("");
  const [proofValid, setProofValid] = useState(false);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [cooldown, startCooldown] = useCooldown(location.state?.verificationSent ? COOLDOWN_SECONDS : 0);
  const actionMode = params.get("mode");
  const actionCode = params.get("oobCode");
  const submitLock = useRef(false);

  useDocumentMeta({ title: `${path === "/signup" ? "Create account" : path.includes("reset") || path === "/forgot-password" ? "Account recovery" : path === "/verify-email" ? "Verify email" : "Sign in"} | Universal Dicta Couture`, noindex: true });

  useEffect(() => {
    if (path !== "/auth/action") return;
    let active = true;
    async function handleAction() {
      setBusy(true); setError("");
      try {
        if (actionMode === "verifyEmail" || actionMode === "verifyAndChangeEmail") {
          if (actionRequest.current?.code !== actionCode) {
            actionRequest.current = { code: actionCode, promise: inspectEmailVerificationCode(actionCode) };
          }
          await actionRequest.current.promise;
          if (active) setProofValid(true);
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

  useLayoutEffect(() => {
    if (!["/auth/action", "/reset-password"].includes(path)) return;
    // Retain the proof in this mounted flow's memory only, not browser history,
    // referrers or later navigation. Initial host request log redaction is owner work.
    window.history.replaceState(window.history.state, "", path);
    const meta = document.createElement("meta"); meta.name = "referrer"; meta.content = "no-referrer"; document.head.appendChild(meta);
    return () => meta.remove();
  }, [path]);

  useEffect(() => {
    if (path !== "/reset-password") return;
    if (!actionCode) return;
    let active = true;
    inspectPasswordResetCode(actionCode).then((email) => { if (active) { setResetEmail(email); setResetValid(true); } }).catch((requestError) => { if (active) { setResetValid(false); setError(accountError(requestError)); } });
    return () => { active = false; };
  }, [path, actionCode]);

  function finishAuth() {
    clearKeepSignedInPreference();
    navigate(returnTo, { replace: true });
  }

  async function submitSignIn(event) {
    event.preventDefault(); if (submitLock.current || outcomeUnknown || !isFirebaseConfigured) return;
    submitLock.current = true;
    setBusy(true); setCredentialsPending(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const credential = await signIn(String(form.get("email") || "").trim(), String(form.get("password") || ""));
      if (!mounted.current) return;
      if (location.state?.verifyAfterSignIn && !credential.user.emailVerified) {
        navigate("/verify-email", { replace: true, state: { returnTo, returnState } });
      } else finishAuth();
    } catch (requestError) { if (mounted.current) { setError(accountError(requestError)); if (["auth/network-request-failed", "auth/outcome-unknown", "outcome-unknown"].includes(requestError.code)) setOutcomeUnknown(true); } }
    finally { submitLock.current = false; if (mounted.current) { setBusy(false); setCredentialsPending(false); } }
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
    event.preventDefault(); if (submitLock.current || !isFirebaseConfigured) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const confirm = String(form.get("confirmPassword") || "");
    const policyError = passwordPolicyError(password); if (policyError) return setError(policyError);
    if (password !== confirm) return setError("Your passwords do not match.");
    submitLock.current = true;
    setBusy(true); setCredentialsPending(true); setError("");
    try {
      await signUp(email, password);
      if (mounted.current) navigate("/verify-email", { replace: true, state: { returnTo } });
    } catch (requestError) { setError(accountError(requestError)); }
    finally { submitLock.current = false; if (mounted.current) { setBusy(false); setCredentialsPending(false); } }
  }

  async function submitForgot(event) {
    event.preventDefault(); if (submitLock.current || outcomeUnknown) return;
    submitLock.current = true;
    const email = String(new FormData(event.currentTarget).get("email") || "").trim();
    setBusy(true); setError("");
    try { await requestPasswordReset(email, returnTo); setSentEmail(email); startCooldown(); }
    catch (requestError) { if (mounted.current) { setError(accountError(requestError)); setOutcomeUnknown(true); } }
    finally { submitLock.current = false; if (mounted.current) setBusy(false); }
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

  async function submitNewPassword(event) {
    event.preventDefault(); if (busy || !resetValid) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const policyError = passwordPolicyError(password); if (policyError) return setError(policyError);
    if (password !== String(form.get("confirmPassword") || "")) return setError("Your passwords do not match.");
    setBusy(true); setError("");
    try { await setPasswordFromResetCode(actionCode, password); if (mounted.current) setCompleted("password"); }
    catch (requestError) { setError(accountError(requestError)); }
    finally { setBusy(false); }
  }

  if (isLoading) return <AuthShell><div className="auth-flow"><p role="status">Checking your account…</p></div></AuthShell>;

  if (sessionState === "unverifiable" || sessionState === "revoked") return <AuthShell><div className="auth-flow"><FlowIntro title={sessionState === "revoked" ? "Session revoked" : "Current session unable to verify"}>No private Account context is shown. Current session and Account authority must be established independently.</FlowIntro><Button onClick={recheckSession}>Check current session</Button><Button variant="secondary" onClick={useAnotherAccount}>Sign out / use another account</Button></div></AuthShell>;

  if (completed === "verified") return <AuthShell><div className="auth-flow auth-success"><FlowIntro mark="✓" eyebrow="EMAIL CONTROL" title="Email Verified">This confirms email control only. Current Account lifecycle and destination authorization still apply.</FlowIntro><div className="auth-flow__actions"><Button onClick={user ? finishAuth : () => navigate("/signin", { state: { returnTo, returnState } })}>CONTINUE →</Button></div></div></AuthShell>;
  if (completed === "password") return <AuthShell><div className="auth-flow auth-success"><FlowIntro mark="✓" eyebrow="SECURE ACCOUNT RECOVERY" title="Password Updated">Welcome back to Universal Dicta Couture. Your new password has been set successfully.</FlowIntro><div className="auth-flow__actions"><Button to="/signin" state={{ returnTo, returnState }}>SIGN IN →</Button></div></div></AuthShell>;

  if ((path === "/signin" || path === "/signup") && user && !credentialsPending) return <AuthShell><div className="auth-flow auth-success"><FlowIntro mark="●" eyebrow="CURRENT PRINCIPAL" title="You’re already signed in">Current login: {maskEmail(user.email)}. Authentication does not establish unrestricted UDC Account access.</FlowIntro>{error && <p role="alert" className="auth-flow__status">{error}</p>}<div className="auth-flow__actions"><Button onClick={finishAuth}>CONTINUE →</Button><Button variant="secondary" disabled={busy} onClick={useAnotherAccount}>USE ANOTHER ACCOUNT</Button><Button variant="ghost" onClick={returnToBrowsing}>BACK</Button></div></div></AuthShell>;

  if (path === "/auth/action") return <AuthShell><div className="auth-flow"><FlowIntro title="Secure account link">Opening this link checks its purpose; it does not automatically change Account or credential state.</FlowIntro>{busy && <p role="status">Checking current proof…</p>}{proofValid && <><p role="status">The provider confirms a valid email-control proof. Durable identity and lifecycle must still be checked before consumption.</p><Button isLoading={busy} onClick={async () => { setBusy(true); try { await applyEmailVerificationCode(actionCode); if (mounted.current) setCompleted("verified"); } catch (failure) { if (mounted.current) setError(accountError(failure)); } finally { if (mounted.current) setBusy(false); } }}>Confirm email verification</Button></>}{error && <><p id="auth-error" className="auth-flow__status" role="alert">{error}</p><Button to={actionMode === "resetPassword" ? "/forgot-password" : "/verify-email"} state={{ returnTo, returnState }}>Request a fresh link</Button></>}</div></AuthShell>;

  if (path === "/account-unavailable") return <AuthShell><div className="auth-flow auth-success"><FlowIntro mark="⌁" eyebrow="PRIVATE CUSTOMER AREA" title="This page is unavailable for this account.">The link may be private, unavailable, or no longer active. For your privacy, access cannot be granted from this account.</FlowIntro><div className="auth-flow__actions"><Button to={user ? "/profile" : "/signin"} state={!user ? { returnTo: "/profile" } : undefined}>GO TO PROFILE →</Button><Button to="/chats" variant="secondary">OPEN CHATS</Button><Button variant="ghost" onClick={returnToBrowsing}>BACK</Button></div></div></AuthShell>;

  if (path === "/verify-email") {
    if (!user) return <AuthShell><div className="auth-flow"><FlowIntro title="Verify your email">Sign in to continue your email verification.</FlowIntro><Button to="/signin" state={{ returnTo, returnState, verifyAfterSignIn: true }}>SIGN IN →</Button></div></AuthShell>;
    if (user.emailVerified) return <AuthShell><div className="auth-flow"><FlowIntro mark="✓" title="Your email is verified">Email control is confirmed. UDC Account binding, lifecycle and target access remain independent.</FlowIntro><Button onClick={finishAuth}>CONTINUE →</Button></div></AuthShell>;
    return <AuthShell><div className="auth-flow"><FlowIntro mark="✉" eyebrow="ONE SECURE STEP" title="Verify your email">{location.state?.verificationSent ? "We’ve sent a verification link to " : "Send a verification link to "}<span className="auth-flow__email">{maskEmail(user.email)}</span>. Open the email and tap the verification link to finish creating your account.</FlowIntro>
      {notice && <p className="auth-flow__status auth-flow__status--success" role="status">{notice}</p>}{error && <p className="auth-flow__status" role="alert">{error}</p>}
      <div className="auth-flow__actions"><Button disabled={busy || cooldown > 0} onClick={resendVerification}>{cooldown ? `RESEND EMAIL IN ${cooldown}s` : "SEND VERIFICATION EMAIL"}</Button><Button variant="ghost" disabled={busy} onClick={refreshVerification}>CHECK CURRENT EMAIL CONTROL</Button><Button variant="ghost" onClick={returnToBrowsing}>BACK</Button></div><p className="auth-flow__fineprint">Email-change binding is a protected owner workflow, not a generic verification shortcut.</p>
      <p className="auth-flow__fineprint">Verification links are secure and time-limited. If sending is temporarily limited, wait for the cooldown and try again.</p></div></AuthShell>;
  }

  if (path === "/forgot-password") return <AuthShell><div className="auth-flow"><FlowIntro mark="⌁" eyebrow="SECURE RECOVERY" title="Forgot your password?">Enter the email linked to your account and we’ll send you a secure reset link.</FlowIntro>
    {!sentEmail ? <form className="auth-flow__form" onSubmit={submitForgot}><div className="auth-field"><label htmlFor="forgot-email">Email</label><input id="forgot-email" name="email" type="email" required autoComplete="email"/></div><Button type="submit" isLoading={busy}>SEND RESET LINK →</Button></form> : <div className="auth-flow auth-success"><p className="auth-flow__status auth-flow__status--success">If this request is eligible, a reset link may be sent to <strong>{maskEmail(sentEmail)}</strong>. Check your inbox and spam folder. Delivery is not confirmed here.</p><div className="auth-flow__actions"><Button onClick={() => navigate("/signin", { state: { returnTo, returnState } })}>GOT IT</Button><Button variant="secondary" onClick={() => { setSentEmail(""); setError(""); }}>CHANGE EMAIL</Button><Button variant="ghost" disabled={cooldown > 0 || busy || outcomeUnknown} onClick={async () => { setBusy(true); try { await requestPasswordReset(sentEmail, returnTo); startCooldown(); } catch (requestError) { setError(accountError(requestError)); setOutcomeUnknown(true); } finally { setBusy(false); } }}>{cooldown ? `RESEND EMAIL IN ${cooldown}s` : "RESEND EMAIL"}</Button></div></div>}
    {error && <p className="auth-flow__status" role="alert">{error}</p>}<p className="auth-flow__fineprint">For privacy, this page does not reveal whether an email address belongs to an account.</p><p className="auth-flow__switch"><Link to="/signin" state={{ returnTo, returnState }}>Back to Sign In</Link></p></div></AuthShell>;

  if (path === "/reset-password") return <AuthShell><div className="auth-flow"><FlowIntro mark="⌁" eyebrow="SECURE RECOVERY" title="Create New Password">Set a secure new password for your account{resetEmail ? ` (${maskEmail(resetEmail)})` : ""}.</FlowIntro>
    {resetValid === false && error ? <><p id="auth-error" className="auth-flow__status" role="alert">{error}</p><Button to="/forgot-password" state={{ returnTo, returnState }}>REQUEST A NEW LINK</Button></> : resetValid ? <form className="auth-flow__form" onSubmit={submitNewPassword}><PasswordField id="new-password" name="password" label="New Password" minLength={15} autoComplete="new-password"/><PasswordField id="confirm-new-password" name="confirmPassword" label="Confirm New Password" minLength={15} autoComplete="new-password"/><Button type="submit" isLoading={busy}>SET NEW PASSWORD →</Button><p id="auth-error" className="auth-flow__status" role={error ? "alert" : undefined}>{error}</p></form> : <p role="status">Checking this secure reset link…</p>}
    <p className="auth-flow__switch"><Link to="/signin" state={{ returnTo, returnState }}>Back to Sign In</Link></p></div></AuthShell>;

  const creating = path === "/signup";
  const signInTitle = sessionExpired ? "Your Session Has Expired" : sessionState === "signed-out" ? "Signed Out" : sessionState === "session-ended" ? "Session ended" : "Welcome back";
  const signInCopy = sessionExpired ? "Please establish a current session again. Account lifecycle still applies." : sessionState === "signed-out" ? "Your current provider session has ended. You may deliberately sign in again." : sessionState === "session-ended" ? "This session ended. A lifecycle restriction or deletion is not inferred from this event." : "Continue your Universal Dicta Couture experience.";
  return <AuthShell><div className="auth-flow"><FlowIntro mark={creating ? "◇" : sessionExpired ? "⌁" : "◆"} eyebrow={creating ? "JOIN THE HOUSE" : sessionExpired ? "SESSION ENDED" : "PRIVATE CLIENT ACCESS"} title={creating ? "Create your account" : signInTitle}>{creating ? "Start your Universal Dicta Couture experience." : signInCopy}</FlowIntro>
    {!isFirebaseConfigured && <p className="auth-flow__status" role="alert">Account access is temporarily unavailable. Please try again later.</p>}
    {creating && <p className="auth-flow__status" role="status">Account creation requires the trusted durable-identity/login-conflict bootstrap source, which is not integrated yet. No Account or historical relationship will be created from this form until that source is available.</p>}
    <form className={"auth-flow__form" + (creating ? " auth-flow__form--signup" : "")} aria-busy={busy} onSubmit={creating ? submitSignUp : submitSignIn}>
      <div className="auth-field"><label htmlFor="auth-email">Email</label><input id="auth-email" name="email" type="email" required autoComplete={creating ? "email" : "username"} aria-describedby="auth-error" /></div>
      <PasswordField id="auth-password" name="password" label="Password" minLength={creating ? 15 : undefined} autoComplete={creating ? "new-password" : "current-password"}/>
      {creating && <PasswordField id="auth-confirm" name="confirmPassword" label="Confirm Password" minLength={15} autoComplete="new-password"/>}
      {!creating && <div className="auth-choice-row"><Link to="/forgot-password" state={{ returnTo }}>Forgot password?</Link></div>}
      <Button type="submit" disabled={busy || outcomeUnknown || !isFirebaseConfigured} isLoading={busy}>{creating ? "CREATE ACCOUNT →" : "SIGN IN →"}</Button>
      <p id="auth-error" className="auth-flow__status" role={error ? "alert" : undefined}>{error}</p>
      {outcomeUnknown && <p role="status">The result is unresolved. Check current session state before any repeat.</p>}
    </form>
    {creating && <p className="auth-flow__fineprint">By creating an account, you agree to our <Link to="/policies">Terms</Link> and acknowledge our <Link to="/policies">Privacy Policy</Link>. Style Circle marketing remains a separate choice.</p>}
    <p className="auth-flow__switch">{creating ? <>Already have an account? <Link to="/signin" state={{ returnTo, returnState }}>Sign In</Link></> : <>New here? <Link to="/signup" state={{ returnTo, returnState }}>Create Account</Link></>}</p>
    <div className="auth-flow__actions"><Button variant="ghost" onClick={returnToBrowsing}>BACK</Button></div>
    <p className="auth-flow__fineprint">Safe internal navigation may continue after authentication. Every private destination checks current Account authority independently; no action is replayed.</p>
  </div></AuthShell>;
}
