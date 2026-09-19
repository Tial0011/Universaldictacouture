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
import footerSignature from "../../assets/brand/footer-signature.png";
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
];

/** Single-destination footer rows (no dropdown) — they navigate
 *  straight to their page rather than expanding a list. */
const DIRECT_LINKS = [
  { to: "/about", label: "About Us" },
  { to: "/our-story", label: "Our Story" },
  { to: "/policies", label: "Policies" },
];

const SOCIAL_ICONS = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  linkedin: LinkedInIcon,
  whatsapp: WhatsAppIcon,
};

/** One footer nav group. A native <details> gives an accessible,
 *  keyboard-operable collapse with no extra JS. Closed by default on
 *  every breakpoint — the desktop layout forces the content visible
 *  with CSS (see Footer.css) without changing the underlying state. */
function FooterNavGroup({ heading, links }) {
  return (
    <details className="footer-group">
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
        {/* Left: brand mark, footer headline, social row, copyright. */}
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

          <p className="site-footer__legal">
            &copy; {year} {BRAND.name}. All rights reserved.
          </p>
        </div>

        {/* Right: collapsible nav rows + direct pages, then the signature. */}
        <div className="site-footer__links">
          <nav aria-label="Footer navigation" className="site-footer__nav-groups">
            {NAV_GROUPS.map((group) => (
              <FooterNavGroup key={group.id} heading={group.heading} links={group.links} />
            ))}

            <div className="footer-direct">
              {DIRECT_LINKS.map((link) => (
                <Link key={link.to} to={link.to} className="footer-direct__link">
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>

          {/* Cropped from the client-provided reference design (not
              recreated) — see note to the client about sourcing a
              proper high-resolution/vector version. */}
          <img
            src={footerSignature}
            alt=""
            aria-hidden="true"
            className="site-footer__flourish"
          />
        </div>
      </div>

      <div className="container site-footer__cta-row">
        <Button to="/chats" variant="primary" className="site-footer__cta">
          <ChatBubbleIcon size={18} />
          Chat with Dicta Couturier
        </Button>
      </div>
    </footer>
  );
}
