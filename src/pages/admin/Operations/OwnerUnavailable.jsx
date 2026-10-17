import { DOMAIN_CONTRACTS } from "../../../services/staffAuthorization";
import Button from "../../../components/common/Button";
import OperationalState from "../../../components/admin/OperationalState";
const boundaryNotes = {
  customers: "Current Account/Profile context belongs to Section 11. No current Profile is inferred from conversation or transaction history, and no support edit or lifecycle action is available from this surface.",
  orders: "Main Order, Order Entry and Extension identities remain separate. Original Snapshots and historical Editions cannot be edited here; assignment and fulfilment remain owner actions.",
  payments: "V1 is bank transfer only. Amount Due Now is transaction-specific, not a fixed percentage. Payment completion does not establish Order fulfilment. No proof, financial zero or verification result is inferred while the source is unavailable.",
  customStyle: "A request is not a Main Order. Measurements and inspiration media require separate current purpose/object/media authority and are not Profile fields or broad previews. Opening, chatting or sole eligibility never assigns or converts a request. Conversion, provenance and assignment require the owner workflow.",
};
export default function OwnerUnavailable({ domain }) {
  const contract = DOMAIN_CONTRACTS[domain];
  return <section className="admin-panel admin-stack"><p className="admin-eyebrow">Operational source</p><h1>{contract.label}</h1>
    <OperationalState state="source-unavailable" message={`Source unavailable. This codebase does not yet provide the authoritative ${contract.label} operational workflow.`} />
    <p>Current context, protected actions and exact owner links will become available when the owning system is integrated. No business records or substitute workflow have been created.</p>
    {boundaryNotes[domain] && <p>{boundaryNotes[domain]}</p>}
    <Button to="/admin" variant="secondary">Return to Dashboard</Button></section>;
}
