import { useEffect, useId, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import Logo from "../brand/Logo";
import CustomStyleIcon from "./icons/CustomStyleIcon";
import ReviewsIcon from "./icons/ReviewsIcon";
import "./Header.css";

const PRIMARY_LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/shop", label: "Shop" },
  { to: "/custom-style", label: "Custom Style" },
  { to: "/reviews-feeds", label: "Reviews & Feeds" },
  { to: "/chats", label: "Chats" },
  { to: "/about", label: "About" },
];

const MOBILE_DRAWER_LINKS = [
  { to: "/custom-style", label: "Custom Style" },
  { to: "/reviews-feeds", label: "Reviews & Feeds" },
  { to: "/saved-pieces", label: "Saved Pieces" },
  { to: "/about", label: "About" },
  { to: "/profile", label: "Profile" },
];

function Icon({ name, size = 20 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.7",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    focusable: "false",
  };
  const paths = {
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    heart: <><path d="M20.8 8.8c0 5-8.8 10-8.8 10s-8.8-5-8.8-10A4.8 4.8 0 0 1 12 5.9a4.8 4.8 0 0 1 8.8 2.9Z" /></>,
    user: <><circle cx="12" cy="8" r="3.3" /><path d="M5.2 20c.7-3.1 3-5 6.8-5s6.1 1.9 6.8 5" /></>,
    closet: <><path d="M5 5.5h14v13H5z" /><path d="M9 5.5V4.4A2.5 2.5 0 0 1 11.5 2h1A2.5 2.5 0 0 1 15 4.4v1.1" /><path d="M8 10h8" /></>,
    menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
    close: <><path d="m6 6 12 12" /><path d="M18 6 6 18" /></>,
    chat: <><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.8 8.8 0 0 1-3.3-.7L4 20l1.5-4.1A7.2 7.2 0 0 1 4.5 12 7.5 7.5 0 0 1 12 4.5a7.5 7.5 0 0 1 8 7Z" /><path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01" /></>,
    home: <><path d="M4 11.5 12 4l8 7.5" /><path d="M6 10v9.5h12V10" /><path d="M9.75 19.5V14h4.5v5.5" /></>,
    bag: <><path d="M7 8.5V7a5 5 0 0 1 10 0v1.5" /><path d="M5.5 8.5h13l.9 12.2a1.5 1.5 0 0 1-1.5 1.6H6.1a1.5 1.5 0 0 1-1.5-1.6Z" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function HeaderLink({ to, label, end = false, onNavigate, icon }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) => (isActive ? "is-active" : undefined)}
    >
      {icon ? <Icon name={icon} size={22} /> : null}
      <span>{label}</span>
    </NavLink>
  );
}

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const drawerId = useId();
  const drawerRef = useRef(null);
  const menuButtonRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isMenuOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        menuButtonRef.current?.focus();
      }
      if (event.key === "Tab" && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled])'
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const firstFocusable = drawerRef.current?.querySelector("a[href], button:not([disabled])");
    firstFocusable?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isMenuOpen]);

  const closeMenu = () => setIsMenuOpen(false);

  const submitSearch = (event) => {
    event.preventDefault();
    const query = search.trim();
    navigate(query ? `/shop?search=${encodeURIComponent(query)}` : "/shop");
  };

  return (
    <header className="site-header">
      <div className="site-header__utility" aria-label="Service information">
        <div className="container site-header__utility-inner">
          <span>WEAR CULTURE, PRESERVE HERITAGE!</span>
        </div>
      </div>

      <div className="site-header__desktop">
        <div className="container site-header__main">
          <NavLink to="/" className="site-header__brand" aria-label="Universal Dicta Couture home">
            <Logo size="header" />
          </NavLink>

          <nav className="site-header__primary" aria-label="Primary navigation">
            <ul>
              {PRIMARY_LINKS.map((link) => (
                <li key={link.to}><HeaderLink {...link} /></li>
              ))}
            </ul>
          </nav>

          <div className="site-header__tools">
            <form className="site-header__search" role="search" onSubmit={submitSearch}>
              <label htmlFor="desktop-product-search" className="visually-hidden">Product Search</label>
              <Icon name="search" size={19} />
              <input
                id="desktop-product-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Product Search"
                type="search"
                autoComplete="off"
              />
            </form>
            <NavLink className="site-header__tool" to="/profile" aria-label="Profile" title="Profile"><Icon name="user" /></NavLink>
            <NavLink className="site-header__tool" to="/saved-pieces" aria-label="Saved Pieces" title="Saved Pieces"><Icon name="heart" /></NavLink>
            <NavLink className="site-header__tool" to="/my-closet" aria-label="My Closet" title="My Closet"><Icon name="closet" /></NavLink>
          </div>
        </div>
      </div>

      <div className="site-header__mobile">
        <div className="site-header__mobile-top container">
          <button
            ref={menuButtonRef}
            type="button"
            className="site-header__icon-button"
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMenuOpen}
            aria-controls={drawerId}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            <Icon name={isMenuOpen ? "close" : "menu"} />
          </button>

          <NavLink to="/" className="site-header__mobile-brand" aria-label="Universal Dicta Couture home" onClick={closeMenu}>
            <Logo size="header" />
          </NavLink>

          <div className="site-header__mobile-actions">
            <NavLink
              className="site-header__action site-header__action--icon-only"
              to="/shop"
              aria-label="Search"
              title="Search"
            >
              <Icon name="search" size={20} />
            </NavLink>
            <NavLink className="site-header__action" to="/custom-style" aria-label="Custom Style">
              <CustomStyleIcon size={21} />
              <span>Custom Style</span>
            </NavLink>
            <NavLink className="site-header__action" to="/reviews-feeds" aria-label="Reviews">
              <ReviewsIcon size={19} />
              <span>Reviews</span>
            </NavLink>
          </div>
        </div>

        <div
          ref={drawerRef}
          id={drawerId}
          className={`site-header__drawer${isMenuOpen ? " is-open" : ""}`}
          aria-hidden={!isMenuOpen}
        >
          <nav aria-label="Mobile menu">
            <ul>
              {MOBILE_DRAWER_LINKS.map((link) => (
                <li key={link.to}>
                  <HeaderLink {...link} onNavigate={closeMenu} />
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      <nav className="site-header__mobile-bottom" aria-label="Mobile primary navigation">
        <HeaderLink to="/" label="Home" icon="home" end />
        <HeaderLink to="/shop" label="Shop" icon="bag" />
        <HeaderLink to="/chats" label="Chats" icon="chat" />
        <HeaderLink to="/my-closet" label="My Closet" icon="closet" />
      </nav>

      <NavLink className="site-header__chat-launcher" to="/chats" aria-label="Chat with Dicta Couturier">
        <Icon name="chat" size={19} />
        <span>CHAT WITH DICTA COUTURIER</span>
      </NavLink>
    </header>
  );
}
