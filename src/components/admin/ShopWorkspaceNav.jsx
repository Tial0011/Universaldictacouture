import { Link, useLocation } from "react-router-dom";
import { useStaff } from "../../context/StaffContext";
import { allows } from "../../services/staffAuthorization";

const ITEMS = [
  { label: "Overview", to: "/admin/shop", match: (path, search, hash) => path === "/admin/shop" && !search && !hash },
  { label: "Products", to: "/admin/products", match: (path, search) => path === "/admin/products" && !new URLSearchParams(search).get("view") && !new URLSearchParams(search).get("focus") },
  { label: "New In", to: "/admin/products?view=new-in", match: (path, search) => path === "/admin/products" && new URLSearchParams(search).get("view") === "new-in" },
  { label: "Shop By", to: "/admin/discovery", match: (path) => path === "/admin/discovery" },
  { label: "Catalogue Structure", to: "/admin/taxonomy", match: (path) => path === "/admin/taxonomy" },
  { label: "Search / Keywords", to: "/admin/products?focus=search", match: (path, search) => path === "/admin/products" && new URLSearchParams(search).get("focus") === "search" },
  { label: "Shop Health", to: "/admin/shop#shop-health", match: (path, search, hash) => path === "/admin/shop" && hash === "#shop-health" },
];

export default function ShopWorkspaceNav() {
  const { pathname, search, hash } = useLocation();
  const { staff } = useStaff();
  const items = ITEMS.filter(item => !["/admin/discovery", "/admin/taxonomy"].includes(item.to) || allows(staff, "content.read", { purpose: "content" }));
  return (
    <nav className="admin-shop-workspace-nav" aria-label="Shop administration">
      <span className="admin-shop-workspace-nav__label">Shop</span>
      <div className="admin-shop-workspace-nav__links">
        {items.map((item) => {
          const active = item.match(pathname, search, hash);
          return <Link key={item.label} to={item.to} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}>{item.label}</Link>;
        })}
      </div>
    </nav>
  );
}
