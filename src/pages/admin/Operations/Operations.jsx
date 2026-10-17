import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useStaff } from "../../../context/StaffContext";
import { useOperations } from "../../../hooks/useOperations";
import { attentionItems, resultState } from "../../../services/operationsModel";
import { resolveOperationalOpen, safeContextCapsule } from "../../../services/operationalActions";
import { readOperationalRecord } from "../../../services/operations";
import { DOMAIN_CONTRACTS } from "../../../services/staffAuthorization";
import { SourceStatus, OperationalCards, MoreSources } from "../../../components/admin/OperationalViews";
import AttentionContext from "../../../components/admin/AttentionContext";
import OperationalState from "../../../components/admin/OperationalState";

export default function Operations({ mode = "attention", onlyDomain = "" }) {
  const { staff } = useStaff();
  const { domains, sources, items, load } = useOperations(onlyDomain);
  const [params] = useSearchParams();
  const [category, setCategory] = useState(() => params.get("source") || "all");
  const [view, setView] = useState(() => ["mine", "unassigned"].includes(params.get("view")) ? params.get("view") : "all");
  const [notice, setNotice] = useState("");
  const [noticeState, setNoticeState] = useState("normal");
  const [opening, setOpening] = useState("");
  const [preview, setPreview] = useState(null);
  const navigate = useNavigate();
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const candidates = useMemo(() => mode === "source" ? items : attentionItems(items), [items, mode]);
  const filtered = candidates.filter(item => (category === "all" || item.domain === category)
    && (view === "all" || (view === "mine" ? item.assignedStaffId === staff.staffId : item.domain === "chats" && item.assignedStaffId === "")));
  const anyLoading = domains.some(domain => !sources[domain] || sources[domain].state === "initial-loading");
  const anyUnavailable = domains.some(domain => sources[domain] && !["success", "empty", "initial-loading"].includes(sources[domain].state));
  async function open(item) {
    if (opening) return;
    setOpening(`${item.domain}:${item.id}`); setNotice("");
    try {
      const result = await resolveOperationalOpen(safeContextCapsule(item, { attention: mode === "attention", issue: item.issueKeys?.[0] }), readOperationalRecord);
      if (!mounted.current) return;
      if (["resolved-elsewhere", "unavailable"].includes(result.state)) {
        setNoticeState(result.state);
        setNotice(result.state === "unavailable" ? "No currently accessible owner context could be verified." : "Resolved elsewhere or no longer actionable. No local action was performed.");
        void load(item.domain);
      } else navigate(result.href);
    } catch (error) {
      if (mounted.current) { setNoticeState(resultState(error)); setNotice(resultState(error) === "restricted" ? "Current access does not permit this context." : "Current owner state could not be checked. Please refresh when the source is available."); void load(item.domain); }
    } finally { if (mounted.current) setOpening(""); }
  }
  const title = mode === "source" ? DOMAIN_CONTRACTS[onlyDomain].label : "Attention Centre";
  return <div className="admin-stack"><header className="admin-page-heading"><div><p className="admin-eyebrow">Your operational atelier</p><h1>{title}</h1>
    <p>{mode === "attention" ? "Find work requiring attention, check current owner state and open its exact workflow."
      : mode === "source" ? "Minimum-necessary owner context. Opening a record checks current authorization and state independently."
        : "Recent owner-record updates. Event history and human actor attribution require the owner activity source; this view is not formal Audit."}</p></div></header>
    <SourceStatus sources={sources} domains={domains} onRefresh={load} />
    {!domains.length ? <section className="admin-panel"><h2>No operational sources available</h2><p>Your current access permits the minimum staff experience. No inaccessible work or counts are exposed.</p></section> : <>
      <div className="admin-list-tools">
        <div className="field"><label htmlFor="operations-category">Source</label><select id="operations-category" value={category} onChange={event => setCategory(event.target.value)}><option value="all">All accessible sources</option>{domains.map(domain => <option value={domain} key={domain}>{DOMAIN_CONTRACTS[domain].label}</option>)}</select></div>
        {mode === "attention" && domains.includes("chats") && <div className="field"><label htmlFor="operations-view">Responsibility</label><select id="operations-view" value={view} onChange={event => setView(event.target.value)}><option value="all">All accessible work</option><option value="mine">My Work</option><option value="unassigned">Unassigned accessible Chats</option></select></div>}
      </div>
      {notice && <OperationalState state={noticeState} message={notice} />}
      {anyLoading && <p role="status">Loading accessible sources. Available work remains usable.</p>}
      {anyUnavailable && <p role="status">Some sources could not be checked. This is a partial view.</p>}
      {!anyLoading && !filtered.length && <p role="status">{anyUnavailable ? "No matching work in currently available sources." : "No matching work in the loaded accessible records."}</p>}
      <OperationalCards items={filtered} onOpen={open} opening={opening} onPreview={mode === "attention" ? (item, opener) => setPreview({ item, opener }) : undefined} /><MoreSources sources={sources} domains={domains} onLoad={load} />
      {preview && <AttentionContext key={preview.item.domain + ":" + preview.item.id} item={preview.item} opener={preview.opener} onClose={() => setPreview(null)} onReconcile={load} />}
    </>}
  </div>;
}
