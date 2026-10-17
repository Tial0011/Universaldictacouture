import { useCallback, useEffect, useRef, useState } from "react";
import { useStaff } from "../../../context/StaffContext";
import { activityPlans, canViewTeamActivity, relativeEventTime } from "../../../services/operationalActivity";
import { loadActivityPage, readOperationalRecord } from "../../../services/operations";
import { resolveOperationalOpen, safeContextCapsule } from "../../../services/operationalActions";
import { useNavigate } from "react-router-dom";
import Button from "../../../components/common/Button";
import OperationalState from "../../../components/admin/OperationalState";
import { runtimeErrorState } from "../../../services/operationalRuntime";
function ActivityFeed({ view }) {
  const [source, setSource] = useState({ items: [], state: "loading" });
  const [notice, setNotice] = useState("");
  const [opening, setOpening] = useState(false);
  const mounted = useRef(false);
  const busy = useRef(false);
  const openLock = useRef(false);
  const navigate = useNavigate();
  const load = useCallback(async (more = false, cursor = null) => {
    if (busy.current) return;
    busy.current = true;
    setSource(previous => more ? { ...previous, loadingMore: true } : { items: [], state: "loading" });
    try {
      const page = await loadActivityPage(view, more ? cursor : null);
      if (mounted.current) setSource(previous => ({ ...page, state: "checked", items: [...new Map([...(more ? previous.items : []), ...page.items].map(item => [item.id, item])).values()].sort((a, b) => b.occurredAt - a.occurredAt) }));
    } catch (error) { if (mounted.current) setSource({ items: [], state: runtimeErrorState(error) }); }
    finally { busy.current = false; }
  }, [view]);
  useEffect(() => { mounted.current = true; queueMicrotask(() => { if (mounted.current) void load(); }); return () => { mounted.current = false; }; }, [load]);
  async function open(event) {
    if (openLock.current) return;
    openLock.current = true; setOpening(true); setNotice("");
    try {
      const result = await resolveOperationalOpen(safeContextCapsule({ domain: event.domain, id: event.objectId }), readOperationalRecord);
      if (!mounted.current) return;
      if (result.href) navigate(result.href); else setNotice("Current related context is unavailable. This event does not grant access.");
    } catch { if (mounted.current) setNotice("Current related context could not be verified. No additional record details are disclosed."); }
    finally { openLock.current = false; if (mounted.current) setOpening(false); }
  }
  return <section className="admin-stack admin-activity-feed" aria-label="Operational event feed">
    {source.state === "checked" ? <p role="status">Checked {new Date(source.refreshedAt).toLocaleTimeString()}. {source.hasMore ? "Partial events loaded; other eligible event pages remain." : "Available event pages checked."}</p> : <OperationalState state={source.state} onRetry={() => load()} />}
    <Button variant="secondary" disabled={source.state === "loading" || source.loadingMore} onClick={() => load()}>Refresh events</Button>
    {notice && <p role="status">{notice}</p>}
    {source.state === "checked" && !source.items.length && <p>{source.hasMore ? "No eligible events in this page; continue to other event pages." : "No eligible Product lifecycle events in the scope checked."}</p>}
    <ul className="admin-activity-list">{source.items.map(event => <li className="admin-panel" key={event.id}><h2>{event.summary}</h2><p>{event.actor}</p><time dateTime={new Date(event.occurredAt).toISOString()} title={new Date(event.occurredAt).toLocaleString()} aria-label={`${relativeEventTime(event.occurredAt)} · ${new Date(event.occurredAt).toLocaleString()}`}>{relativeEventTime(event.occurredAt)}</time><Button variant="secondary" disabled={opening} onClick={() => open(event)}>Open current related Product</Button></li>)}</ul>
    {source.hasMore && <Button variant="secondary" isLoading={source.loadingMore} onClick={() => load(true, source.cursor)}>Load more eligible events</Button>}
  </section>;
}
export default function RecentActivity() {
  const { staff } = useStaff();
  const [view, setView] = useState("mine");
  const available = activityPlans(staff, view).length > 0;
  return <div className="admin-stack"><header className="admin-page-heading"><div><p className="admin-eyebrow">What recently changed</p><h1>Recent Activity</h1><p>Meaningful confirmed owner events, not record timestamps, notifications or formal Audit. Current integration covers Product unpublish, archive and restore only; no edits or Chat messages are listed.</p></div></header>
    {canViewTeamActivity(staff) && <div className="field"><label htmlFor="activity-scope">Activity scope</label><select id="activity-scope" value={view} onChange={event => setView(event.target.value)}><option value="mine">My Activity</option><option value="team">Team Product Activity — authorized domain scope</option></select></div>}
    {available ? <ActivityFeed key={view} view={view} /> : <section className="admin-panel"><p role="status">Event source unavailable for current access. Independent event-evidence and related Product scope are required; no hidden activity or count is disclosed.</p><Button to="/admin" variant="secondary">Return to Dashboard</Button></section>}
  </div>;
}
