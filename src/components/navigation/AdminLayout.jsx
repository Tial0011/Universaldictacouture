import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { signOutUser } from "../../firebase/auth";
import { ADMIN_SECTIONS } from "../admin/adminSections";
import Logo from "../brand/Logo";
import Button from "../common/Button";
import "./AdminLayout.css";

export default function AdminLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const main = useRef(null);
  const title = ADMIN_SECTIONS.find(section => section.path === pathname)?.label || (pathname === "/admin/settings" ? "Setup & access" : "Overview");
  useEffect(() => { main.current?.focus(); }, [pathname]);
  async function logout() {
    setBusy(true); setError("");
    try { await signOutUser(); } catch { setError("Unable to sign out. Please try again."); }
    finally { setBusy(false); }
  }
  const navLink = (path, label) => <NavLink to={path} end onClick={() => setMenuOpen(false)} className={({ isActive }) => isActive ? "is-active" : ""}>{label}</NavLink>;
  return <div className="admin-layout">
    <a className="skip-link" href="#admin-main">Skip to admin content</a>
    <aside className="admin-layout__sidebar" aria-label="Admin navigation">
      <Link to="/admin" className="admin-brand" aria-label="Universal Dicta Couture admin overview"><Logo /></Link>
      <div className="admin-sidebar-heading"><p className="admin-eyebrow">Studio administration</p>
        <Button variant="secondary" className="admin-menu-toggle" aria-expanded={menuOpen} aria-controls="admin-navigation" onClick={() => setMenuOpen(!menuOpen)}>Menu</Button>
      </div>
      <nav id="admin-navigation" className={menuOpen ? "admin-nav is-open" : "admin-nav"}>
        {navLink("/admin", "Overview")}
        {["Catalogue", "Website content"].map(group => <div className="admin-nav__group" key={group}>
          <p>{group}</p><ul>{ADMIN_SECTIONS.filter(section => section.group === group).map(section => <li key={section.path}>{navLink(section.path, section.label)}</li>)}</ul>
        </div>)}
        <div className="admin-nav__group">{navLink("/admin/settings", "Setup & access")}</div>
      </nav>
      <p className="admin-sidebar-note">Universal Dicta Couture<br />Website administration</p>
    </aside>
    <div className="admin-workspace">
      <header className="admin-topbar"><p>Admin <span aria-hidden="true">/</span> <strong>{title}</strong></p><div className="admin-actions"><Button to="/" variant="ghost">View website ↗</Button><Button variant="secondary" isLoading={busy} onClick={logout}>Sign out</Button></div></header>
      {error && <p className="field__error" role="alert">{error}</p>}
      <main id="admin-main" tabIndex={-1} ref={main} className="admin-layout__content"><Outlet /></main>
      <footer className="admin-footer">Signed in as {user?.email || "administrator"}</footer>
    </div>
  </div>;
}
