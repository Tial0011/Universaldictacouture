import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import Logo from "../brand/Logo";
import { BRAND } from "../brand/brandLanguage";
import { SOCIAL_LINKS } from "../../config/socialLinks";
import {
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
  WhatsAppIcon,
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
      { to: "/reviews-feeds", label: "Review & Feeds" },
    ],
  },
  {
    id: "care",
    heading: "Customer Care",
    links: [
      { to: "/chats", label: "Chat with Dicta Couturier" },
      { to: "/profile", label: "Profile" },
      { to: "/my-closet/my-pieces", label: "My Pieces" },
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

/** Native mobile disclosure; actually open on desktop, so links stay
 *  available to assistive technology as well as visually displayed. */
function FooterNavGroup({ heading, links }) {
  const detailsRef = useRef(null);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const details = detailsRef.current;
    const update = () => {
      details.open = media.matches;
      details.querySelector("summary").tabIndex = media.matches ? -1 : 0;
    };
    const keepDesktopOpen = () => { if (media.matches && !details.open) details.open = true; };
    update();
    media.addEventListener("change", update);
    details.addEventListener("toggle", keepDesktopOpen);
    return () => { media.removeEventListener("change", update); details.removeEventListener("toggle", keepDesktopOpen); };
  }, []);
  return (
    <details className="footer-group" ref={detailsRef}>
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

export default function Footer({ followsStyleCircle = false }) {
  const year = new Date().getFullYear();

  return (
    <>
    {followsStyleCircle && <div className="couture-separator" aria-hidden="true"><div className="container couture-separator__inner"><span /><i /><span /></div></div>}
    <footer className={`site-footer surface--brand${followsStyleCircle ? " site-footer--after-circle" : ""}`}>
      <div className="container site-footer__top">
        {/* Left: brand mark, footer headline and social row. */}
        <div className="site-footer__brand-block">
          {/* White knockout of the wordmark (see logoAsset.js) sits
              directly on the wine footer background — no plaque
              needed since this variant is already legible on wine. */}
          <Logo size="footer" variant="white" className="site-footer__logo" />
          <p className="site-footer__headline">
            {BRAND.tagline.split(", ").map((line, i) => (
              <span key={i} className="site-footer__headline-line">
                {i === 0 ? `${line},` : line}
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
      <div className="container site-footer__bottom">
        <p className="site-footer__legal">&copy; {year} {BRAND.name}. All rights reserved.</p>
        <p className="site-footer__declaration">{BRAND.declaration}</p>
      </div>
    </footer>
    </>
  );
}
