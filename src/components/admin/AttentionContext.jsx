import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../common/Button";
import OperationalState from "./OperationalState";
import { readOperationalRecord } from "../../services/operations";
import { resolveOperationalOpen, safeContextCapsule } from "../../services/operationalActions";
import { runtimeErrorState } from "../../services/operationalRuntime";
export default function AttentionContext({ item, opener, onClose, onReconcile }) {
  const [result, setResult] = useState({ state: "loading", current: null });
  const [opening, setOpening] = useState(false);
  const dialog = useRef(null);
  const mounted = useRef(false);
  const busy = useRef(false);
  const navigate = useNavigate();
  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true; setResult({ state: "loading", current: null });
    try {
      const resolved = await resolveOperationalOpen(safeContextCapsule(item, { attention: true, issue: item.issueKeys?.[0] }), readOperationalRecord);
      if (mounted.current) {
        setResult({ state: resolved.state, current: resolved.current, checkedAt: Date.now() });
        if (resolved.state === "resolved-elsewhere") onReconcile(item.domain);
      }
    } catch (error) { if (mounted.current) setResult({ state: runtimeErrorState(error), current: null }); }
    finally { busy.current = false; }
  }, [item, onReconcile]);
  useEffect(() => {
    mounted.current = true;
    dialog.current.showModal();
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    queueMicrotask(() => { if (mounted.current) void load(); });
    return () => {
      mounted.current = false;
      document.body.style.overflow = priorOverflow;
      if (opener?.isConnected && opener.getClientRects().length) opener.focus();
      else document.getElementById("admin-main")?.focus();
    };
  }, [load, opener]);
  async function openOwner() {
    if (busy.current) return;
    busy.current = true; setOpening(true);
    try {
      const resolved = await resolveOperationalOpen(safeContextCapsule(item, { attention: true, issue: item.issueKeys?.[0] }), readOperationalRecord);
      if (!mounted.current) return;
      if (resolved.href) { onClose(); navigate(resolved.href); }
      else { setResult({ state: resolved.state, current: resolved.current }); onReconcile(item.domain); }
    } catch (error) { if (mounted.current) setResult({ state: runtimeErrorState(error), current: null }); }
    finally { busy.current = false; if (mounted.current) setOpening(false); }
  }
  return <dialog ref={dialog} id="attention-context" className="admin-context-overlay" aria-labelledby="attention-context-title" onCancel={event => { event.preventDefault(); onClose(); }} onClose={onClose}>
    <header className="admin-section-heading"><h2 id="attention-context-title">Attention context</h2><Button variant="ghost" autoFocus onClick={onClose}>Close context</Button></header>
    <div className="admin-stack"><p>Read-only operational context. This preview is not an owner workflow, private-media access or an authorization grant.</p>
      {["current", "changed"].includes(result.state) && result.current ? <><h3>{result.current.label}</h3><p>Current owner state: {result.current.state}</p><p>{result.current.reason}</p>{result.state === "changed" && <OperationalState state="stale" />}<small>Checked <time dateTime={new Date(result.checkedAt).toISOString()}>{new Date(result.checkedAt).toLocaleTimeString()}</time></small><Button isLoading={opening} onClick={openOwner}>Open current owner workflow</Button><Button variant="secondary" onClick={load}>Refresh context</Button></>
        : <OperationalState state={result.state} onRetry={load} />}
    </div>
  </dialog>;
}
