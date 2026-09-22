import { Link } from "react-router-dom";
import { ADMIN_SECTIONS } from "../../../components/admin/adminSections";
import Button from "../../../components/common/Button";
export default function Dashboard() {
  return <div className="admin-stack">
    <header className="admin-page-heading"><div><p className="admin-eyebrow">Your studio, at a glance</p><h1>A little care. A beautiful collection.</h1><p>Manage your pieces and keep your website fresh, all from one place.</p></div><Button to="/admin/products?new=1">Add a product</Button></header>
    <section className="admin-panel admin-start"><div><p className="admin-eyebrow">A simple place to start</p><h2>Bring your next piece to the shop.</h2><p>Add its details and photos, save a draft, then publish when it is ready.</p></div><ol><li>Add the piece</li><li>Check the details</li><li>Publish to the shop</li></ol></section>
    <section aria-labelledby="manage-title"><h2 id="manage-title">What would you like to manage?</h2><div className="admin-card-grid">{ADMIN_SECTIONS.map((section, index) => <Link className="admin-panel admin-section-card" key={section.path} to={section.path}><span className="admin-card-number" aria-hidden="true">0{index + 1}</span><h3>{section.label}</h3><p>{section.description}</p><span className="admin-card-action">{section.action} <span aria-hidden="true">→</span></span></Link>)}</div></section>
    <section className="admin-panel"><h2>Setting up for the first time?</h2><p>Check account access and image uploads before publishing your first piece.</p><Button to="/admin/settings" variant="secondary">Open setup & access</Button></section>
  </div>;
}
