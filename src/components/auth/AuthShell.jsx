import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Logo from "../brand/Logo";
import ProductImage from "../product/ProductImage";
import { DEFAULT_AUTH_APPEARANCE, fetchAuthAppearance } from "../../services/siteAppearance";
import "./AuthShell.css";

export default function AuthShell({ children, backTo = "/", compact = false }) {
  const navigate = useNavigate();
  const [appearance, setAppearance] = useState(DEFAULT_AUTH_APPEARANCE);
  useEffect(() => { let active = true; fetchAuthAppearance().then((value) => { if (active) setAppearance(value); }); return () => { active = false; }; }, []);
  return <section className={`auth-shell${compact ? " auth-shell--compact" : ""}`}>
    <div className="auth-shell__brandbar">
      <button type="button" className="auth-shell__back" aria-label="Go back" onClick={() => window.history.length > 1 ? navigate(-1) : navigate(backTo)}>←</button>
      <Link to="/" aria-label="Universal Dicta Couture home"><Logo size="header" /></Link>
      <span aria-hidden="true" />
    </div>
    <div className="auth-shell__stage">
      <div className="auth-shell__hero" aria-hidden="true">
        <ProductImage image={appearance.image} alt="" className="auth-shell__hero-image" transformation="w_1400,h_1400,c_fill,g_auto,q_auto,f_auto" />
        <div className="auth-shell__hero-copy">
          <p>{appearance.eyebrow}</p>
          <strong>{appearance.headline}</strong>
          <span>{appearance.supportingText}</span>
        </div>
      </div>
      <div className="auth-shell__content"><div className="auth-shell__panel">{children}</div></div>
    </div>
  </section>;
}
