const artwork = import.meta.glob("../../assets/admin/icons/*.svg", { eager: true, query: "?url", import: "default" });

// Unmodified Feather artwork; colour is inherited without redrawing the icon.
export default function AdminIcon({ name, className = "" }) {
  const source = artwork[`../../assets/admin/icons/${name}.svg`];
  return source ? <span aria-hidden="true" className={`admin-icon ${className}`} style={{ "--admin-icon-source": `url("${source}")` }} /> : null;
}
