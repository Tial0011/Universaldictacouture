import { useState } from "react";
import { NavLink } from "react-router-dom";
import "./Header.css";

const NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/shop", label: "Shop" },
  { to: "/custom-style", label: "Custom Style" },
  { to: "/reviews", label: "Reviews" },
  { to: "/about", label: "About" },
];

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <NavLink to="/" className="site-header__brand" aria-label="Universal Dicta Couture home">
          {/* Replace with the official logo artwork asset once supplied.
              Do not recreate the logo using styled text. */}
          <img
            src="/logo-placeholder.svg"
            alt="Universal Dicta Couture"
            className="site-header__logo"
          />
        </NavLink>

        <button
          type="button"
          className="site-header__toggle"
          aria-expanded={isMenuOpen}
          aria-controls="primary-navigation"
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <span className="visually-hidden">
            {isMenuOpen ? "Close menu" : "Open menu"}
          </span>
          <span className="site-header__toggle-icon" aria-hidden="true" />
        </button>

        <nav
          id="primary-navigation"
          className={`site-header__nav ${isMenuOpen ? "is-open" : ""}`}
          aria-label="Primary"
        >
          <ul>
            {NAV_LINKS.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  onClick={() => setIsMenuOpen(false)}
                  className={({ isActive }) =>
                    isActive ? "is-active" : undefined
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
