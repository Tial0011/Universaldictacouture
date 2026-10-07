import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import ProductImage from "../product/ProductImage";
import { DEFAULT_AUTH_APPEARANCE, fetchAuthAppearance } from "../../services/siteAppearance";
import { safeReturnPath } from "../../services/authFlow";
import "./AuthShell.css";
import Header from "../navigation/Header";

export default function AuthShell({ children, backTo = "/", compact = false }) {
  const location = useLocation();
  const family = ["/signin", "/signup"].includes(location.pathname) ? "entry" : "response";
  const panelRef = useRef(null);
  const [appearance, setAppearance] = useState(DEFAULT_AUTH_APPEARANCE);
  const requestedReturn = safeReturnPath(location.state?.returnTo || new URLSearchParams(location.search).get("returnTo"), backTo);
  const returnTo = ["/profile", "/my-closet/saved-reviews"].includes(requestedReturn.split(/[?#]/)[0]) ? "/" : requestedReturn;
  useEffect(() => { let active = true; fetchAuthAppearance().then((value) => { if (active) setAppearance(value); }); return () => { active = false; }; }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    panelRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);
  return <section className={"auth-shell" + (compact ? " auth-shell--compact" : "")} data-family={family}>
    <a className="skip-link" href="#auth-content">Skip to account form</a>
    <Header />
    <p className="auth-shell__return"><Link to={returnTo}>Return to browsing</Link></p>
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
