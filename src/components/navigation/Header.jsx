import { useEffect, useId, useRef, useState } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import Logo from "../brand/Logo";
import { useAuth } from "../../context/AuthContext";
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
  { to: "/custom-style", label: "Custom Style", icon: "custom-style", description: "Create something personal" },
  { to: "/reviews-feeds", label: "Reviews & Feeds", icon: "reviews", description: "Stories from our clients" },
  { to: "/about", label: "About", icon: "weave", description: "Our house and heritage" },
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
    truck: <><path d="M3 6.5h11v9H3z" /><path d="M14 9.5h3.6l3.4 3.1v2.9h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
    shield: <><path d="m12 3 8 3v5c0 5-8 10-8 10S4 16 4 11V6Z" /><path d="m8.5 11.5 2.5 2.5 4.5-5" /></>,
    quality: <><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z" /></>,
    weave: <><path d="m12 3 9 9-9 9-9-9Z" /><path d="m7.5 7.5 9 9m-9 0 9-9M3 12h18M12 3v18" /></>,
    bag: <><path d="M7 8.5V7a5 5 0 0 1 10 0v1.5" /><path d="M5.5 8.5h13l.9 12.2a1.5 1.5 0 0 1-1.5 1.6H6.1a1.5 1.5 0 0 1-1.5-1.6Z" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function HeaderLink({ to, label, end = false, onNavigate, icon, description }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) => (isActive ? "is-active" : undefined)}
    >
      {icon === "custom-style" ? <CustomStyleIcon size={22} /> :
        icon === "reviews" ? <ReviewsIcon size={22} /> :
          icon ? <Icon name={icon} size={22} /> : null}
      {description ? (
        <span className="site-header__drawer-copy">
          <span className="site-header__drawer-link-label">{label}</span>
          <span className="site-header__drawer-link-description">{description}</span>
        </span>
      ) : <span>{label}</span>}
      {description ? <span className="site-header__drawer-chevron" aria-hidden="true">›</span> : null}
    </NavLink>
  );
}

export default function Header() {
  const { user } = useAuth();
  const adminLabel = user ? "Admin area" : "Admin login";
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const drawerId = useId();
  const drawerRef = useRef(null);
  const menuButtonRef = useRef(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!isMenuOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const mobileViewport = window.matchMedia("(max-width: 767px)");
    const onViewportChange = () => {
      if (!mobileViewport.matches) setIsMenuOpen(false);
    };
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
    mobileViewport.addEventListener("change", onViewportChange);
    const firstFocusable = drawerRef.current?.querySelector("a[href], button:not([disabled])");
    firstFocusable?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      mobileViewport.removeEventListener("change", onViewportChange);
    };
  }, [isMenuOpen]);

  const closeMenu = () => setIsMenuOpen(false);
  const closeMenuAndFocus = () => {
    closeMenu();
    menuButtonRef.current?.focus();
  };

  const submitSearch = (event) => {
    event.preventDefault();
    const query = search.trim();
    // The Shop reads the search term from `q`.
    navigate(query ? `/shop?q=${encodeURIComponent(query)}` : "/shop");
  };

  return (
    <>
      {/* Desktop utility bar, outside the sticky header. */}
      <div className="site-header__utility" role="region" aria-label="Service information">
        <div className="site-header__utility-inner">
          <span className="site-header__utility-item">
            <Icon name="heart" size={17} />
            <span>Beauty in Our Culture</span>
          </span>
          <span className="site-header__utility-item">
            <Icon name="truck" size={17} />
            <span>Nationwide &amp; International Delivery</span>
          </span>
          <span className="site-header__utility-item">
            <Icon name="shield" size={17} />
            <span>Secure Ordering</span>
          </span>
          <span className="site-header__utility-item">
            <Icon name="quality" size={17} />
            <span>Premium Quality</span>
          </span>
          <span className="site-header__utility-item">
            <Icon name="weave" size={17} />
            <span>A Heritage You Wear</span>
          </span>
        </div>
      </div>

      <header className="site-header">
        <div className="site-header__desktop">
          <div className="container site-header__main">
            <NavLink to="/" className="site-header__brand" aria-label="Universal Dicta Couture home">
              <Logo size="header" />
            </NavLink>

            <nav className="site-header__primary" aria-label="Primary navigation">
              <ul>
                {[...PRIMARY_LINKS, { to: "/admin", label: adminLabel }].map((link) => (
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
              <NavLink className="site-header__account-link" to={user ? "/profile" : "/signin"}>{user ? "Account" : "Client login"}</NavLink>
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
              <span aria-hidden="true">{isMenuOpen ? "Close" : "Menu"}</span>
            </button>

            <NavLink to="/" className="site-header__mobile-brand" aria-label="Universal Dicta Couture home" onClick={closeMenu}>
              <Logo size="header" />
            </NavLink>

            <div className="site-header__mobile-actions">
              <NavLink className="site-header__action" to="/shop?focus=search" aria-label="Search">
                <Icon name="search" size={20} />
                <span>Search</span>
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

          <button
            type="button"
            className={`site-header__drawer-backdrop${isMenuOpen ? " is-open" : ""}`}
            aria-label="Close menu"
            tabIndex={-1}
            onClick={closeMenuAndFocus}
          />
          <div
            ref={drawerRef}
            id={drawerId}
            className={`site-header__drawer${isMenuOpen ? " is-open" : ""}`}
            role="dialog"
            aria-modal={isMenuOpen ? "true" : undefined}
            aria-labelledby={`${drawerId}-title`}
            aria-hidden={!isMenuOpen}
            inert={!isMenuOpen}
          >
            <div className="site-header__drawer-top">
              <div className="site-header__drawer-brand">
                <Logo size="header" variant="white" className="site-header__drawer-logo" />
                <h2 id={`${drawerId}-title`} className="visually-hidden">Universal Dicta Couture menu</h2>
                <p>Modern fashion. A heritage you wear.</p>
              </div>
              <button type="button" className="site-header__drawer-close" aria-label="Close menu" onClick={closeMenuAndFocus}>
                <Icon name="close" size={22} />
              </button>
            </div>
            <nav aria-label="Mobile menu">
              <p className="site-header__drawer-group-label">The House</p>
              <ul>
                {MOBILE_DRAWER_LINKS.map((link) => (
                  <li key={link.to}>
                    <HeaderLink {...link} onNavigate={closeMenu} />
                  </li>
                ))}
              </ul>
              <p className="site-header__drawer-group-label">Your Account</p>
              <ul>
                {[
                  { to: "/profile", label: "Profile", icon: "user", description: "Your personal space" },
                  ...(!user ? [
                    { to: "/signin", label: "Client login", icon: "user", description: "Welcome back" },
                    { to: "/signup", label: "Sign up", icon: "heart", description: "Join our style circle" },
                  ] : []),
                  { to: "/admin", label: adminLabel, icon: "shield", description: "Couture administration" },
                ].map((link) => (
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
          <HeaderLink to={user ? "/profile" : "/signin"} label={user ? "Account" : "Client login"} icon="user" />
        </nav>

        {pathname !== "/chats" && <NavLink className="site-header__chat-launcher" to="/chats" aria-label="Chat with Dicta Couturier">
          <Icon name="chat" size={19} />
          <span>CHAT WITH DICTA COUTURIER</span>
        </NavLink>}
      </header>
    </>
  );
}
