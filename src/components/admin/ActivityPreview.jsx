import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStaff } from "../../context/StaffContext";
import { activityPlans, relativeEventTime } from "../../services/operationalActivity";
import { loadActivityPage, readOperationalRecord } from "../../services/operations";
import { resolveOperationalOpen, safeContextCapsule } from "../../services/operationalActions";
import { runtimeErrorState } from "../../services/operationalRuntime";
import OperationalState from "./OperationalState";
import Button from "../common/Button";
export default function ActivityPreview() {
  const { staff } = useStaff();
  const available = activityPlans(staff).length > 0;
  const [source, setSource] = useState({ state: "loading", items: [] });
  const [notice, setNotice] = useState("");
  const mounted = useRef(false);
  const busy = useRef(false);
  const navigate = useNavigate();
  useEffect(() => {
    mounted.current = true;
    if (!available) return () => { mounted.current = false; };
    const load = async () => {
      try {
        let cursor = null;
        let more = false;
        let items = [];
        // A preview is deliberately bounded, not an all-history query.
        for (let page = 0; page < 3; page++) {
          const result = await loadActivityPage("mine", cursor);
          if (!mounted.current) return;
          items.push(...result.items); cursor = result.cursor; more = result.hasMore;
          if (!more) break;
        }
        setSource({ state: "checked", items: [...new Map(items.map(item => [item.id, item])).values()].sort((a, b) => b.occurredAt - a.occurredAt).slice(0, 3), more });
      } catch (error) { if (mounted.current) setSource({ state: runtimeErrorState(error), items: [] }); }
    };
    void load();
    return () => { mounted.current = false; };
  }, [available]);
  async function open(event) {
    if (busy.current) return;
    busy.current = true;
    try {
      const result = await resolveOperationalOpen(safeContextCapsule({ domain: event.domain, id: event.objectId }), readOperationalRecord);
      if (mounted.current) { if (result.href) navigate(result.href); else setNotice("Current related context is unavailable; the event is not permission."); }
    } catch { if (mounted.current) setNotice("Current related access could not be verified. No additional record details are disclosed."); }
    finally { busy.current = false; }
  }
  return <section className="admin-panel admin-stack" aria-labelledby="activity-preview-title"><h2 id="activity-preview-title">Recent Activity</h2><p>Meaningful confirmed Product lifecycle events in checked pages. Formal Audit and transaction history remain independent.</p>
    {!available ? <p role="status">Event evidence or related owner scope is unavailable for current access.</p> : source.state !== "checked" ? <OperationalState state={source.state} /> : <>
      {source.more && <p role="status">Partial event pages checked; open Recent Activity for more.</p>}
      {!source.items.length && <p>No eligible events in the pages checked. This is not an all-history conclusion.</p>}
      <ul className="admin-activity-list">{source.items.map(event => <li key={event.id}><h3>{event.summary}</h3><p>{event.actor}</p><time dateTime={new Date(event.occurredAt).toISOString()} title={new Date(event.occurredAt).toLocaleString()}>{relativeEventTime(event.occurredAt)}</time><Button variant="ghost" onClick={() => open(event)}>Open current related Product</Button></li>)}</ul>
    </>}{notice && <p role="status">{notice}</p>}<Button to="/admin/activity" variant="secondary">Open Recent Activity</Button>
  </section>;
}
