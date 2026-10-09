import { useAuth } from "../../../context/AuthContext";
import { useStaff } from "../../../context/StaffContext";
import {OWNER_PROFILE} from '../../../services/superAdminPolicy';
import Button from '../../../components/common/Button';
export default function Settings() {
  const { user } = useAuth();
  const { staff } = useStaff();
  return <div className="admin-stack">
    <header className="admin-page-heading"><div><p className="admin-eyebrow">Operational atelier</p><h1>Staff context</h1><p>Your current identity and staff access.</p></div></header>
    <section className="admin-panel"><h2>Your staff identity</h2><p>{staff.displayName || "Staff"}</p><p className="admin-reference">{staff.staffId}</p><p>{user?.email}</p></section>
    <section className="admin-panel"><h2>Current access</h2><p>Staff access is active. Each protected destination and action independently checks current capability, purpose and scope.</p><p>Function as Couturier, eligibility, availability and assignment are separate. A title or a visible button never grants permission.</p></section>
    <section className="admin-panel"><h2>Access and governance</h2>{staff.accessProfile===OWNER_PROFILE?<><p>Manage other admins and their individual permissions. Either website owner can approve a change.</p><Button to="/admin/settings/admins">Manage admin permissions</Button></>:<p>Contact a website owner for changes to your permissions.</p>}</section>
  </div>;
}
