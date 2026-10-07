import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../common/Button";
import "./AuthGate.css";

function LockMark() {
  return <span className="auth-gate__lock" aria-hidden="true"><svg viewBox="0 0 32 32"><rect x="8" y="14" width="16" height="13" rx="3"/><path d="M11 14v-3.5a5 5 0 0 1 10 0V14"/></svg></span>;
}

export default function AuthGateDialog({ gate, onClose }) {
  const navigate = useNavigate();
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!gate) return undefined;
    const previous = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = "hidden";
    if (!dialogRef.current.open) dialogRef.current.showModal();
    closeRef.current?.focus();
    const dialog = dialogRef.current;
    return () => { dialog.close(); document.body.style.overflow = previous; if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); };
  }, [gate, onClose]);
  if (!gate) return null;

  const openAccount = (destination) => {
    const state = gate.continuation || { returnTo: gate.returnTo };
    onClose();
    navigate(destination, { state });
  };

  return <dialog ref={dialogRef} className="auth-gate" aria-labelledby="auth-gate-title" aria-describedby="auth-gate-copy" onCancel={event => { event.preventDefault(); onClose(); }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="auth-gate__dialog">
      <button ref={closeRef} className="auth-gate__close" type="button" aria-label="Close sign in prompt" onClick={onClose}>×</button>
      <div className="auth-gate__weave" aria-hidden="true" />
      <LockMark />
      <p className="auth-gate__eyebrow">Universal Dicta Couture</p>
      <h2 id="auth-gate-title">Sign in to continue</h2>
      <p id="auth-gate-copy">Keep your favourite pieces and conversations together. Sign in or create your account to continue.</p>
      <div className="auth-gate__actions">
        <Button onClick={() => openAccount("/signin")}>SIGN IN →</Button>
        <Button variant="secondary" onClick={() => openAccount("/signup")}>CREATE AN ACCOUNT</Button>
        <Button variant="ghost" onClick={onClose}>KEEP BROWSING</Button>
      </div>
      <p className="auth-gate__return">We’ll bring you back to where you left off.</p>
    </section>
  </dialog>;
}
