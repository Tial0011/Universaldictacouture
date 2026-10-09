import { Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useStaff } from "../../context/StaffContext";
import { allows, canDiscover } from "../../services/staffAuthorization";
import { signOutUser } from "../../firebase/auth";
import { ADMIN_SECTIONS, isShopAdminPath } from "../admin/adminSections";
import ShopWorkspaceNav from "../admin/ShopWorkspaceNav";
import Logo from "../brand/Logo";
import Button from "../common/Button";
import LoadingSpinner from "../common/LoadingSpinner";
import PageBoundary from "../common/PageBoundary";
import SearchEntry from "../admin/SearchEntry";
import { searchDomains } from "../../services/operationalSearch";
import "./AdminLayout.css";
import "../admin/AdminVisual.css";
import AdminIcon from "../admin/AdminIcon";
import NotificationBell from '../notifications/NotificationBell';

const destinationIcons = { "/admin": "home", "/admin/attention": "alert-circle", "/admin/search": "search", "/admin/activity": "activity", "/admin/products": "shopping-bag", "/admin/chats": "message-square", "/admin/customers": "users", "/admin/orders": "package", "/admin/payments": "credit-card", "/admin/custom-style": "scissors", "/admin/homepage": "layout", "/admin/appearance": "image", "/admin/reviews": "file-text", "/admin/audit": "shield", "/admin/settings": "settings" };

export default function AdminLayout() {
  const { user } = useAuth();
  const { staff } = useStaff();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const main = useRef(null);
  const sheet = useRef(null);
  const trigger = useRef(null);
  const openNavigation = event => { trigger.current = event.currentTarget; setMenuOpen(true); };
  const sections = ADMIN_SECTIONS.filter(section => section.domain === "content" ? allows(staff, "content.read", { purpose: "content" }) : canDiscover(staff, section.domain));
  const hasWork = ["products", "reviews", "chats"].some(domain => canDiscover(staff, domain));
  const hasSearch = searchDomains(staff).length > 0;
  const shopSection = isShopAdminPath(pathname);
  const title = shopSection ? "Products" : pathname.startsWith('/admin/orders/') ? 'Orders & Operations' : sections.find(section => section.path === pathname)?.label || ({ "/admin/settings": "Staff context", "/admin/attention": "Attention Centre", "/admin/search": "Global Search", "/admin/activity": "Recent Activity" }[pathname] || "Dashboard");
  useEffect(() => { main.current?.focus(); }, [pathname]);
  useEffect(() => {
    const dialog = sheet.current;
    if (menuOpen && !dialog.open) dialog.showModal();
    if (!menuOpen && dialog.open) dialog.close();
    if (!menuOpen) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = priorOverflow; };
  }, [menuOpen]);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1400px)");
    const reset = () => { if (query.matches) setMenuOpen(false); };
    query.addEventListener("change", reset);
    return () => query.removeEventListener("change", reset);
  }, []);
  async function logout() {
    setBusy(true); setError("");
    try { await signOutUser(); navigate("/", { replace: true }); } catch { setError("Unable to sign out. Please try again."); }
    finally { setBusy(false); }
  }
  const navLink = (path, label, forceActive = false) => {
    const active = forceActive || path === '/admin/orders' && pathname.startsWith('/admin/orders/');
    return <NavLink to={path} end onClick={() => setMenuOpen(false)} className={({ isActive }) => isActive || active ? "is-active" : ""} aria-current={active ? "page" : undefined}><AdminIcon name={destinationIcons[path]} /><span>{label}</span></NavLink>;
  };
  const navigation = () => <>
    {navLink("/admin", "Dashboard")}
    {hasWork && navLink("/admin/attention", "Attention Centre")}{hasSearch && navLink("/admin/search", "Global Search")}{hasWork && navLink("/admin/activity", "Recent Activity")}
    {[...new Set(sections.map(section => section.group))].map(group => <div className="admin-nav__group" key={group}><p>{group}</p><ul>{sections.filter(section => section.group === group).map(section => <li key={section.path}>{navLink(section.path, section.label)}</li>)}</ul></div>)}
    {canDiscover(staff, "audit") && navLink("/admin/audit", "Audit History")}
    <div className="admin-nav__group"><p>System Settings</p>{navLink("/admin/settings", "Settings")}</div>
    <div className="admin-nav__group admin-nav__utilities"><Button to="/" variant="ghost">Visit website</Button><Button variant="secondary" isLoading={busy} onClick={logout}>Sign out</Button></div>
  </>;
  return <div className="admin-layout">
    <a className="skip-link" href="#admin-main">Skip to admin content</a>
    <aside className="admin-layout__sidebar" aria-label="Admin navigation">
      <Link to="/admin" className="admin-brand" aria-label="Universal Dicta Couture Dashboard"><Logo variant="white" /></Link>
      <p className="admin-eyebrow">Operational atelier</p>
      <nav className="admin-nav">{navigation()}</nav>
      <p className="admin-sidebar-note">Universal Dicta Couture</p>
    </aside>
    <aside className="admin-layout__rail" aria-label="Compact navigation"><Button variant="secondary" onClick={openNavigation} aria-label="Open labelled navigation"><AdminIcon name="menu" />Menu</Button>{navLink("/admin", "Home")}{hasWork && <>{navLink("/admin/attention", "Work")}{navLink("/admin/search", "Find")}</>}</aside>
    <dialog ref={sheet} id="admin-navigation-sheet" className="admin-navigation-sheet" aria-labelledby="admin-navigation-title" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); setMenuOpen(false); } }} onClose={() => { setMenuOpen(false); if (trigger.current?.getClientRects().length) trigger.current.focus(); else main.current?.focus(); }} onCancel={() => setMenuOpen(false)} onClick={event => { if (event.target === event.currentTarget && event.clientX > event.currentTarget.getBoundingClientRect().right) setMenuOpen(false); }}>
      <header><h2 id="admin-navigation-title">Staff navigation</h2><Button variant="ghost" onClick={() => setMenuOpen(false)} autoFocus>Close navigation</Button></header><Logo variant="white" className="admin-sheet-logo" /><nav className="admin-nav" aria-label="Staff destinations">{navigation()}</nav>
    </dialog>
    <div className="admin-workspace">
      <header className="admin-topbar"><Button variant="secondary" className="admin-menu-toggle" aria-expanded={menuOpen} aria-controls="admin-navigation-sheet" onClick={openNavigation}><AdminIcon name="menu" /><span>Menu</span></Button><Link to="/admin" className="admin-topbar-brand" aria-label="Universal Dicta Couture Dashboard"><Logo /></Link><p>UDC Atelier <span aria-hidden="true">/</span> <strong>{title}</strong></p>
        {hasSearch && <SearchEntry />}
        {canDiscover(staff,'notifications')&&<NotificationBell domain="staff"/>}
        <details className="admin-staff-menu"><summary><AdminIcon name="users" /><span>Staff menu</span></summary><div className="admin-panel"><p>{staff.displayName || "Staff"}</p><p className="admin-reference">{staff.staffId}</p><Button to="/admin/settings" variant="ghost">Staff context</Button><Button variant="secondary" isLoading={busy} onClick={logout}>Sign out</Button></div></details></header>
      {error && <p className="field__error" role="alert">{error}</p>}
      <main id="admin-main" tabIndex={-1} ref={main} className="admin-layout__content">{shopSection && <ShopWorkspaceNav />}<PageBoundary key={pathname}><Suspense fallback={<LoadingSpinner label="Loading admin page" />}><Outlet /></Suspense></PageBoundary></main>
      <footer className="admin-footer">Signed in as {user?.email || "administrator"}</footer>
      <nav className="admin-mobile-bottom" aria-label="Staff mobile navigation">{navLink('/admin','Home')}{navLink('/admin/attention','Attention')}{navLink('/admin/search','Search')}<Button variant="ghost" onClick={openNavigation} aria-expanded={menuOpen}>Menu</Button></nav>
    </div>
  </div>;
}

// M01 navigation handoff only. Reuses existing content owner destinations;
// no Module-3 CRUD, moderation, media store or second Admin shell is introduced.
export function ContentEntry() {
  return <section className="admin-panel admin-stack"><p className="admin-eyebrow">Commerce</p><h1>Content</h1><p>Open the established content workspaces with your current access.</p><div className="admin-actions"><Button to="/admin/homepage" variant="secondary">Homepage content</Button><Button to="/admin/appearance" variant="secondary">Website Appearance</Button></div></section>;
}
