import { useStaff } from "../../context/StaffContext";
import { canDiscover, allows } from "../../services/staffAuthorization";
import Button from "../common/Button";
import OperationalState from "./OperationalState";

export default function StaffRoute({ domain, children }) {
  const { staff } = useStaff();
  const permitted = domain === "content" ? allows(staff, "content.read", { purpose: "content" }) : canDiscover(staff, domain);
  return permitted ? children : <section className="admin-panel admin-stack"><h1>Access unavailable</h1>
    <OperationalState state="permission-denied" message="Your current staff access does not permit this destination. No protected context has been opened." />
    <Button to="/admin" variant="secondary">Return to Dashboard</Button></section>;
}
