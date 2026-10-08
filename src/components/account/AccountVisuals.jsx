import Button from "../common/Button";
import { useLayoutEffect, useRef } from "react";
import { ACCOUNT_NOTICE_STATES } from "./accountVisualContract";
import "./AccountVisuals.css";

// Existing upstream Feather artwork; no customer imagery or authority is inferred.
const artwork = import.meta.glob("../../assets/admin/icons/*.svg", { eager: true, query: "?url", import: "default" });
export function AccountIcon({ name = "shield", className = "" }) {
  return <img className={`account-icon ${className}`} src={artwork[`../../assets/admin/icons/${name}.svg`]} width="24" height="24" alt="" aria-hidden="true" />;
}

// Presentation only. The owning operation supplies a confirmed state; this component
// neither retries a write nor converts elapsed time into a failure/success.
export function AccountNotice({ state = "unavailable", title, children, actions, id, announce = true }) {
  const visual = ACCOUNT_NOTICE_STATES[state] || ACCOUNT_NOTICE_STATES.unavailable;
  return <div id={id} className={`account-notice account-notice--${visual.tone}`} data-state={state}>
    <AccountIcon name={visual.icon} />
    <div><p className="account-notice__title" role={announce ? "status" : undefined}>{title || visual.title}</p>{children && <div className="account-notice__copy">{children}</div>}{actions && <div className="account-notice__actions">{actions}</div>}</div>
  </div>;
}

export function AccountPanel({ title, description, icon, children, className = "", id, action }) {
  return <section id={id} className={`profile-panel ${className}`}>
    <header className="account-panel-heading">{icon && <span className="account-icon-tile"><AccountIcon name={icon} /></span>}<div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</header>
    {children}
  </section>;
}

export function AccountAccessState({ state = "checking", onCheck }) {
  const heading = useRef(null);
  useLayoutEffect(() => { heading.current?.focus({ preventScroll: true }); }, [state]);
  const revoked = state === "revoked";
  const checking = state === "checking";
  const restricted = state === "restricted", deleted = state === "deleted";
  return <section className="container account-access-page"><div className="account-access-state">
    <span className="account-access-state__icon"><AccountIcon name={revoked ? "lock" : "shield"} /></span>
    <p className="profile-eyebrow">Your privacy comes first</p>
    <h1 ref={heading} tabIndex={-1}>{revoked ? "Session revoked" : restricted ? "Account Restricted" : deleted ? "Account unavailable" : checking ? "Checking current access" : "Your information is currently unavailable"}</h1>
    <p role="status">{revoked ? "This session can no longer show private information. Sign in again to establish current access." : restricted ? "Current account access is restricted. Recovery or email verification does not remove this restriction." : deleted ? "Normal access has ended for this account. Account assistance can help with an authorized review; sign-in does not restore it." : checking ? "Your information is protected while we check your current session." : "We can’t check your private account information right now. This does not mean your account is deleted, restricted or empty."}</p>
    <div className="account-access-state__actions">{onCheck && <Button onClick={onCheck}>Check current access</Button>}<Button to="/signin" variant={onCheck ? "secondary" : "primary"}>Account entry</Button>{(restricted || deleted) && <Button to="/policies" variant="secondary">Account assistance information</Button>}<Button to="/shop" variant="ghost">Continue exploring</Button></div>
  </div></section>;
}
