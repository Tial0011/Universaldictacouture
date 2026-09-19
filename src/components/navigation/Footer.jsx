import { Link } from "react-router-dom";
import Button from "../common/Button";
import Logo from "../brand/Logo";
import { BRAND } from "../brand/brandLanguage";
import { SOCIAL_LINKS } from "../../config/socialLinks";
import {
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
  WhatsAppIcon,
  ChatBubbleIcon,
} from "./icons/SocialIcons";
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
      { to: "/chats", label: "Chat with Dicta Couturier" },
      { to: "/profile", label: "Profile" },
      { to: "/saved-pieces", label: "Saved Pieces" },
      { to: "/my-closet", label: "My Closet" },
    ],
  },
  {
    id: "info",
    heading: "Explore",
    links: [
      { to: "/", label: "Home" },
      { to: "/about", label: "About Us" },
    ],
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
  const icon = <IconComponent size={18} />;

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
    <footer className="site-footer surface--brand">
      <div className="container site-footer__top">
        {/* Left: brand mark, footer headline, social row. */}
        <div className="site-footer__brand-block">
          {/* The wordmark artwork is wine + near-black on transparent
              (see Logo.css) and is only legible on a light surface, so
              it sits on a small ivory plaque here rather than directly
              on the wine footer background. */}
          <div className="site-footer__logo-plaque">
            <Logo size="footer" className="site-footer__logo" />
          </div>
          <p className="site-footer__headline">
            {BRAND.footerHeadline.split("\n").map((line, i) => (
              <span key={i} className="site-footer__headline-line">
                {line}
              </span>
            ))}
          </p>

          <ul className="footer-social">
            {SOCIAL_LINKS.map((entry) => (
              <li key={entry.id}>
                <SocialItem {...entry} />
              </li>
            ))}
          </ul>
        </div>

        {/* Right: collapsible nav rows + contact, decorative flourish. */}
        <div className="site-footer__links">
          <nav aria-label="Footer navigation" className="site-footer__nav-groups">
            {NAV_GROUPS.map((group) => (
              <FooterNavGroup key={group.id} heading={group.heading} links={group.links} />
            ))}

            <details className="footer-group">
              <summary className="footer-group__heading">Contact</summary>
              <address className="site-footer__address">
                <p>Ogun State, Nigeria</p>
                <p>
                  <a className="link" href="mailto:universaldictacouture@gmail.com">
                    universaldictacouture@gmail.com
                  </a>
                </p>
                <p>
                  <a className="link" href="tel:09061959388">
                    09061959388
                  </a>
                </p>
                <p>8:00 AM–6:00 PM</p>
              </address>
            </details>
          </nav>

          {/* Decorative typographic flourish only — not a signature. No
              authentic signature asset exists, so per the brief this is
              an abstract monogram treatment rather than an invented one. */}
          <span className="site-footer__flourish" aria-hidden="true">
            UDC
          </span>
        </div>
      </div>

      <div className="container site-footer__cta-row">
        <Button to="/chats" variant="primary" className="site-footer__cta">
          <ChatBubbleIcon size={18} />
          Chat with Dicta Couturier
        </Button>
      </div>

      <div className="site-footer__base">
        <p className="container site-footer__legal">
          &copy; {year} {BRAND.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
