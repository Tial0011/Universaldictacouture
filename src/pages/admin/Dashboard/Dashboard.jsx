import { Link } from "react-router-dom";
import { ADMIN_SECTIONS } from "../../../components/admin/adminSections";
import { useStaff } from "../../../context/StaffContext";
import { useOperations } from "../../../hooks/useOperations";
import { attentionItems, operationalMetrics } from "../../../services/operationsModel";
import { canDiscover, allows, DOMAIN_CONTRACTS } from "../../../services/staffAuthorization";
import { SourceStatus, MetricCards } from "../../../components/admin/OperationalViews";
import Button from "../../../components/common/Button";
import ActivityPreview from "../../../components/admin/ActivityPreview";
import OperationalState from "../../../components/admin/OperationalState";
export default function Dashboard() {
  const { staff } = useStaff();
  const { sources, domains, items, load } = useOperations();
  const work = attentionItems(items);
  const checked = domains.filter(domain => ["success", "empty"].includes(sources[domain]?.state)).length;
  const sections = ADMIN_SECTIONS.filter(section => section.domain === "content"
    ? allows(staff, "content.read", { purpose: "content" }) : canDiscover(staff, section.domain));
  return <div className="admin-stack"><header className="admin-page-heading"><div><p className="admin-eyebrow">Your private operational atelier</p><h1>Dashboard</h1><p>See what needs attention and reach the correct owner workflow.</p></div>
    {domains.length > 0 && <Button to="/admin/attention">Open Attention Centre</Button>}</header>
    {!sections.length ? <section className="admin-panel admin-stack"><h2>Minimum staff experience</h2><OperationalState state="restricted" message="Your staff identity is verified, but no current usable operational authority is available. You can review your staff context and sign out." /><Button to="/admin/settings" variant="secondary">Staff context</Button></section> : <>
      {!domains.length && !allows(staff, "content.read", { purpose: "content" }) && <section className="admin-panel"><h2>Restricted operational experience</h2><p>Your permitted destinations have no integrated owner source in this codebase. No normal work counts or healthy-system conclusion are available; each destination reports its own source state.</p></section>}
      {domains.length > 0 && <section className="admin-panel" aria-labelledby="attention-preview"><h2 id="attention-preview">Needs attention</h2>
        <p>{checked ? `${work.length} actionable records in loaded pages from ${checked} checked sources. This is not a whole-system count.` : "No operational count is available until a source is successfully checked."}</p>
        <ul className="admin-attention-preview">{work.slice(0, 5).map(item => <li key={item.key}><Link to={`/admin/attention?source=${item.domain}`}>{DOMAIN_CONTRACTS[item.domain].label}: {item.label}</Link><span>{item.reason}</span></li>)}</ul>
        {checked > 0 && !work.length && <p>No actionable work found in the sources checked so far.</p>}<Button to="/admin/attention" variant="secondary">Review accessible work</Button></section>}
      <SourceStatus sources={sources} domains={domains} onRefresh={load} />
      <MetricCards metrics={operationalMetrics(staff, sources, domains)} />
      <section aria-labelledby="quick-access"><h2 id="quick-access">Quick access</h2><div className="admin-card-grid">{sections.map(section => <Link className="admin-panel admin-section-card" key={section.path} to={section.path}><h3>{section.label}</h3><p>{section.description}</p><span className="admin-card-action">{section.action} →</span></Link>)}</div></section>
      {domains.length > 0 && <ActivityPreview />}
    </>}
  </div>;
}
