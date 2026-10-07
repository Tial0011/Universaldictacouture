import { useAuth } from "../../../context/AuthContext";
import { useStaff } from "../../../context/StaffContext";
export default function Settings() {
  const { user } = useAuth();
  const { staff } = useStaff();
  return <div className="admin-stack">
    <header className="admin-page-heading"><div><p className="admin-eyebrow">Operational atelier</p><h1>Staff context</h1><p>Your current identity and staff access.</p></div></header>
    <section className="admin-panel"><h2>Your staff identity</h2><p>{staff.displayName || "Staff"}</p><p className="admin-reference">{staff.staffId}</p><p>{user?.email}</p></section>
    <section className="admin-panel"><h2>Current access</h2><p>Staff access is active. Each protected destination and action independently checks current capability, purpose and scope.</p><p>Function as Couturier, eligibility, availability and assignment are separate. A title or a visible button never grants permission.</p></section>
    <section className="admin-panel"><h2>Access and governance</h2><p>Contact the authorized governance owner for access changes. Shared accounts and a second Couturier identity are not supported.</p><p>Permission administration requires a protected governance workflow. This surface cannot grant, revoke or expand business authority.</p></section>
  </div>;
}
