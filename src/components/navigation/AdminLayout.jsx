import { NavLink, Outlet } from "react-router-dom";
import "./AdminLayout.css";

const ADMIN_LINKS = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/products", label: "Products" },
  { to: "/admin/taxonomy", label: "Taxonomy" },
  { to: "/admin/discovery", label: "Discovery" },
  { to: "/admin/homepage", label: "Homepage" },
  { to: "/admin/reviews", label: "Reviews" },
];

export default function AdminLayout() {
  return (
    <div className="admin-layout">
      <aside className="admin-layout__sidebar" aria-label="Admin navigation">
        <p className="admin-layout__title">Admin</p>
        <nav>
          <ul>
            {ADMIN_LINKS.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.end}
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
      </aside>
      <div className="admin-layout__content">
        <Outlet />
      </div>
    </div>
  );
}
