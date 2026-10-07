import { useOperations } from "../../../hooks/useOperations";
import { MoreSources, SourceStatus } from "../../../components/admin/OperationalViews";
export default function AuditHistory() {
  const { domains, sources, items, load } = useOperations("audit");
  return <div className="admin-stack"><header className="admin-page-heading"><div><h1>Audit History</h1><p>Read-only committed action evidence. This is separate from Recent Activity and transaction history.</p></div></header>
    <SourceStatus sources={sources} domains={domains} onRefresh={load} />
    <ul className="admin-operational-list">{items.map(item => <li className="admin-panel" key={item.id}><h2>{item.label}</h2><p>Human actor: {item.actorStaffId}</p><p>Execution: {item.execution} · Outcome: {item.state}</p><p>{new Date(item.updatedAt).toLocaleString()}</p><small className="admin-reference">Operation: {item.id}</small></li>)}</ul>
    {sources.audit?.state === "empty" && <p role="status">No audit evidence in this accessible page.</p>}<MoreSources sources={sources} domains={domains} onLoad={load} />
  </div>;
}
