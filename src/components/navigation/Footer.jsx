import { Link } from "react-router-dom";
import Logo from "../brand/Logo";
import { BRAND } from "../brand/brandLanguage";
import "./Footer.css";

/** Approved navigation destinations only. */
const EXPLORE_LINKS = [
  { to: "/shop", label: "Shop" },
  { to: "/custom-style", label: "Custom Style" },
  { to: "/reviews-feeds", label: "Reviews & Feeds" },
  { to: "/chats", label: "Chats" },
  { to: "/about", label: "About" },
];

const ACCOUNT_LINKS = [
  { to: "/profile", label: "Profile" },
  { to: "/saved-pieces", label: "Saved Pieces" },
  { to: "/my-closet", label: "My Closet" },
];

/** Approved social identities. No WhatsApp destination is invented. */
const SOCIAL = [
  { id: "instagram", label: "Instagram", handle: "@dicta_couture" },
  { id: "facebook", label: "Facebook", handle: "@mhiz_dicta" },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="site-footer__brand">
          <Logo size="footer" />
          <p className="site-footer__tagline">{BRAND.tagline}</p>
          <p className="site-footer__declaration">{BRAND.declaration}</p>
          <p className="site-footer__line">{BRAND.supportingLine}</p>
        </div>

        <nav className="site-footer__nav" aria-label="Footer navigation">
          <h2 className="site-footer__heading">Explore</h2>
          <ul>
            {EXPLORE_LINKS.map((link) => (
              <li key={link.to}>
                <Link to={link.to}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav className="site-footer__nav" aria-label="Your pieces">
          <h2 className="site-footer__heading">Your pieces</h2>
          <ul>
            {ACCOUNT_LINKS.map((link) => (
              <li key={link.to}>
                <Link to={link.to}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="site-footer__contact">
          <h2 className="site-footer__heading">Contact</h2>
          <address className="site-footer__address">
            <p>Ogun State, Nigeria</p>
            <p>
              <a className="link" href="mailto:universaldictacouture@gmail.com">
                universaldictacouture@gmail.com
              </a>
            </p>
            <p>
              <a className="link" href="tel:+2349061959388">
                09061959388
              </a>
            </p>
            <p>8:00 AM–6:00 PM</p>
          </address>

          <h2 className="site-footer__heading">Follow</h2>
          <ul className="site-footer__social">
            {SOCIAL.map((account) => (
              <li key={account.id}>
                {account.label}: {account.handle}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="container site-footer__base">
        <p className="site-footer__legal">
          &copy; {year} {BRAND.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
