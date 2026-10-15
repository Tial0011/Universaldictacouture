import { useAuth } from "../../../context/AuthContext";
import { useStaff } from "../../../context/StaffContext";
import {OWNER_PROFILE} from '../../../services/superAdminPolicy';
import Button from '../../../components/common/Button';
import { allows, authorizationRoutes } from '../../../services/staffAuthorization';
import './Settings.css';
export default function Settings() {
  const { user } = useAuth();
  const { staff } = useStaff();
  const bank = allows(staff, "settings.bank.read", { purpose: "financial-settings", objectId: "bank-transfer", governanceArea: "financial-settings", action: "read" });
  const taxonomy = authorizationRoutes(staff, "settings.taxonomy.read", "taxonomy-settings").length > 0;
  const templates = authorizationRoutes(staff, "settings.templates.read", "communication-settings").length > 0;
  return <div className="admin-stack settings-workspace">
    <header className="admin-page-heading"><div><p className="admin-eyebrow">Operational atelier</p><h1>System Settings</h1><p>Shared configuration, protected financial settings and current Staff access.</p></div></header>
    <section className="settings-categories" aria-label="Settings categories">
      <article className="admin-panel admin-stack"><h2>Business &amp; Contact</h2><p>Public business identity, support contact and social destinations.</p><p>This category is not available for editing yet.</p></article>
      <article className="admin-panel admin-stack"><h2>Payments &amp; Bank</h2><p>Protected configuration for future payment instructions.</p>{bank ? <Button to="/admin/settings/bank" variant="secondary">Open Payments &amp; Bank</Button> : <p>Bank-specific access is required.</p>}</article>
      <article className="admin-panel admin-stack"><h2>Delivery &amp; Service</h2><p>Reusable guidance stays separate from individual Order delivery details.</p><p>This category is not available for editing yet.</p></article>
      <article className="admin-panel admin-stack"><h2>Communications</h2><p>In-App and Email. Customer preferences and delivery evidence keep their own workflows.</p>{templates ? <Button to="/admin/notifications/templates" variant="secondary">Manage Communication Templates</Button> : <p>Template access is required.</p>}<p>Additional shared communication controls are not available here yet.</p></article>
      <article className="admin-panel admin-stack"><h2>Discovery &amp; Taxonomy</h2><p>Occasion, Style and Fabric &amp; Pattern definitions.</p>{taxonomy ? <Button to="/admin/settings/taxonomy" variant="secondary">Open Discovery &amp; Taxonomy</Button> : <p>Taxonomy access is required.</p>}</article>
      <article className="admin-panel admin-stack"><h2>Staff &amp; Access</h2><p>Current permissions govern every protected action.</p>{staff.accessProfile === OWNER_PROFILE ? <Button to="/admin/settings/admins" variant="secondary">Manage admin permissions</Button> : <p>Contact a website owner for access changes.</p>}</article>
    </section>
    <section className="admin-panel"><h2>Your staff identity</h2><p>{staff.displayName || "Staff"}</p><p className="admin-reference">{staff.staffId}</p><p>{user?.email}</p></section>
    <section className="admin-panel"><h2>Current access</h2><p>Staff access is active. Each protected destination and action independently checks current capability, purpose and scope.</p><p>Function as Couturier, eligibility, availability and assignment are separate. A title or a visible button never grants permission.</p></section>
    <section className="admin-panel"><h2>Access and governance</h2>{staff.accessProfile===OWNER_PROFILE?<><p>Manage other admins and their individual permissions. Either website owner can approve a change.</p><Button to="/admin/settings/admins">Manage admin permissions</Button></>:<p>Contact a website owner for changes to your permissions.</p>}</section>
  </div>;
}
