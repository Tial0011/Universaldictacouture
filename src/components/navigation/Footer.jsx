import { Link } from "react-router-dom";
import Logo from "../brand/Logo";
import { BRAND } from "../brand/brandLanguage";
import { SOCIAL_LINKS } from "../../config/socialLinks";
import { FacebookIcon, InstagramIcon, LinkedInIcon, WhatsAppIcon } from "./icons/SocialIcons";
import "./Footer.css";

/** Approved navigation destinations only — no invented routes. */
const NAV_GROUPS = [
  {
    id: "shop",
    heading: "Shop",
    links: [
      { to: "/shop", label: "Shop" },
      { to: "/custom-style", label: "Custom Style" },
      { to: "/reviews-feeds", label: "Reviews & Feeds" },
    ],
  },
  {
    id: "care",
    heading: "Customer Care",
    links: [
      { to: "/chats", label: "Chats" },
      { to: "/profile", label: "Profile" },
      { to: "/saved-pieces", label: "Saved Pieces" },
      { to: "/my-closet", label: "My Closet" },
    ],
  },
  {
    id: "info",
    heading: "Information",
    links: [{ to: "/about", label: "About Us" }],
  },
];

const SOCIAL_ICONS = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  linkedin: LinkedInIcon,
  whatsapp: WhatsAppIcon,
};

/** One footer nav group. A native <details> gives an accessible,
 *  keyboard-operable collapse on mobile with no extra JS; CSS forces
 *  it open and hides the toggle affordance from tablet width up. */
function FooterNavGroup({ heading, links }) {
  return (
    <details className="footer-group" open>
      <summary className="footer-group__heading">{heading}</summary>
      <ul>
        {links.map((link) => (
          <li key={link.to}>
            <Link to={link.to}>{link.label}</Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** A social icon: a real link only when a URL is configured, otherwise
 *  a non-interactive placeholder — never a fake clickable link. */
function SocialItem({ id, name, url }) {
  const IconComponent = SOCIAL_ICONS[id];
  const icon = <IconComponent size={19} />;

  if (url) {
    return (
      <a
        className="footer-social__link"
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={name}
      >
        {icon}
      </a>
    );
  }

  return (
    <span className="footer-social__link footer-social__link--pending" aria-hidden="true">
      {icon}
      <span className="visually-hidden">{name} — link coming soon</span>
    </span>
  );
}

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container site-footer__brand-block">
        <Logo size="footer" className="site-footer__logo" />
        <p className="site-footer__tagline">{BRAND.tagline}</p>
        <p className="site-footer__line">{BRAND.supportingLine}</p>
        <p className="site-footer__declaration">{BRAND.declaration}</p>
      </div>

      <div className="site-footer__divider" aria-hidden="true" />

      <div className="container site-footer__grid">
        <nav aria-label="Footer navigation" className="site-footer__nav-groups">
          {NAV_GROUPS.map((group) => (
            <FooterNavGroup key={group.id} heading={group.heading} links={group.links} />
          ))}
        </nav>

        <div className="footer-group footer-group--static">
          <h2 className="footer-group__heading footer-group__heading--static">Contact</h2>
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
        </div>

        <div className="footer-group footer-group--static">
          <h2 className="footer-group__heading footer-group__heading--static">Follow Us</h2>
          <ul className="footer-social">
            {SOCIAL_LINKS.map((entry) => (
              <li key={entry.id}>
                <SocialItem {...entry} />
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="site-footer__base">
        <p className="container site-footer__legal">
          &copy; {year} {BRAND.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
