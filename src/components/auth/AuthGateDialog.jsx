import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../common/Button";
<<<<<<< HEAD
import "./AuthGate.css";

function LockMark() {
  return <span className="auth-gate__lock" aria-hidden="true"><svg viewBox="0 0 32 32"><rect x="8" y="14" width="16" height="13" rx="3"/><path d="M11 14v-3.5a5 5 0 0 1 10 0V14"/></svg></span>;
=======
import { AccountIcon } from "../account/AccountVisuals";
import "./AuthGate.css";

function LockMark() {
  return <span className="auth-gate__lock" aria-hidden="true"><AccountIcon name="lock" /></span>;
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
}

export default function AuthGateDialog({ gate, onClose }) {
  const navigate = useNavigate();
  const closeRef = useRef(null);
<<<<<<< HEAD
  useEffect(() => {
    if (!gate) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const keydown = (event) => {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab") return;
      const dialog = closeRef.current?.closest('[role="dialog"]');
      const focusable = dialog?.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", keydown); };
  }, [gate, onClose]);
  if (!gate) return null;

  const signIn = () => {
    const state = { returnTo: gate.returnTo, returnState: gate.returnState || null };
    onClose();
    navigate("/signin", { state });
  };

  return <div className="auth-gate" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="auth-gate__dialog" role="dialog" aria-modal="true" aria-labelledby="auth-gate-title" aria-describedby="auth-gate-copy">
=======
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!gate) return undefined;
    const previous = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = "hidden";
    if (!dialogRef.current.open) dialogRef.current.showModal();
    closeRef.current?.focus();
    const dialog = dialogRef.current;
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previous;
      if (previousFocus?.isConnected && previousFocus.getClientRects().length
        && !previousFocus.closest("[hidden], [inert], [aria-hidden='true']") && !previousFocus.disabled) previousFocus.focus({ preventScroll: true });
      else {
        const target = document.querySelector("main h1") || document.querySelector("main");
        if (target) { target.setAttribute("tabindex", "-1"); target.focus({ preventScroll: true }); }
      }
    };
  }, [gate, onClose]);
  if (!gate) return null;

  const openAccount = (destination) => {
    const state = gate.continuation || { returnTo: gate.returnTo };
    onClose();
    navigate(destination, { state });
  };

  return <dialog ref={dialogRef} className="auth-gate" aria-labelledby="auth-gate-title" aria-describedby="auth-gate-copy" onCancel={event => { event.preventDefault(); onClose(); }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="auth-gate__dialog">
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
      <button ref={closeRef} className="auth-gate__close" type="button" aria-label="Close sign in prompt" onClick={onClose}>×</button>
      <div className="auth-gate__weave" aria-hidden="true" />
      <LockMark />
      <p className="auth-gate__eyebrow">Universal Dicta Couture</p>
      <h2 id="auth-gate-title">Sign in to continue</h2>
<<<<<<< HEAD
      <p id="auth-gate-copy">This feature is reserved for signed-in Universal Dicta Couture customers. Sign in to continue from where you left off.</p>
      <div className="auth-gate__actions">
        <Button onClick={signIn}>SIGN IN →</Button>
        <Button variant="secondary" onClick={onClose}>GO BACK</Button>
      </div>
      <p className="auth-gate__return">We’ll return you to this page after sign in. Your final action will still be yours to confirm.</p>
    </section>
  </div>;
=======
      <p id="auth-gate-copy">Keep your favourite pieces and conversations together. Sign in or create your account to continue.</p>
      <div className="auth-gate__actions">
        <Button onClick={() => openAccount("/signin")}>SIGN IN →</Button>
        <Button variant="secondary" onClick={() => openAccount("/signup")}>CREATE AN ACCOUNT</Button>
        <Button variant="ghost" onClick={onClose}>KEEP BROWSING</Button>
      </div>
      <p className="auth-gate__return">We’ll return you safely. Signing in won’t submit the action you started.</p>
    </section>
  </dialog>;
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
}
