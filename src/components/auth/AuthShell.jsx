import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Logo from "../brand/Logo";
import ProductImage from "../product/ProductImage";
import { DEFAULT_AUTH_APPEARANCE, fetchAuthAppearance } from "../../services/siteAppearance";
import { safeReturnPath } from "../../services/authFlow";
import "./AuthShell.css";

export default function AuthShell({ children, backTo = "/", compact = false }) {
  const location = useLocation();
  const panelRef = useRef(null);
  const [appearance, setAppearance] = useState(DEFAULT_AUTH_APPEARANCE);
  const requestedReturn = safeReturnPath(location.state?.returnTo || new URLSearchParams(location.search).get("returnTo"), backTo);
  const returnTo = ["/profile", "/my-closet/saved-reviews"].includes(requestedReturn.split(/[?#]/)[0]) ? "/" : requestedReturn;
  useEffect(() => { let active = true; fetchAuthAppearance().then((value) => { if (active) setAppearance(value); }); return () => { active = false; }; }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    panelRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);
  return <section className={"auth-shell" + (compact ? " auth-shell--compact" : "")}>
    <a className="skip-link" href="#auth-content">Skip to account form</a>
    <header className="auth-shell__brandbar">
      <Link className="auth-shell__back" to={returnTo} state={location.state?.returnState} aria-label="Return to browsing">←</Link>
      <Link to="/" aria-label="Universal Dicta Couture home"><Logo size="header" /></Link>
      <span className="auth-shell__brandnote">THE CLIENT EXPERIENCE</span>
    </header>
    <div className="auth-shell__stage">
      <div className="auth-shell__hero" aria-hidden="true">
        <ProductImage image={appearance.image} alt="" className="auth-shell__hero-image" loading="eager" transformation="w_1400,h_1400,c_fill,g_auto,q_auto,f_auto" />
        <div className="auth-shell__hero-copy">
          <p>{appearance.eyebrow}</p>
          <strong>{appearance.headline}</strong>
          <span>{appearance.supportingText}</span>
        </div>
      </div>
      <main className="auth-shell__content" id="auth-content" ref={panelRef} tabIndex={-1}>
        <div className="auth-shell__panel">{children}</div>
        <p className="auth-shell__signature">WEAR CULTURE, PRESERVE HERITAGE!</p>
      </main>
    </div>
  </section>;
}
