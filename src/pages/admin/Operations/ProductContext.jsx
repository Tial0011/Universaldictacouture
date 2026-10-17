import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Operations from "./Operations";
import { readOperationalRecord } from "../../../services/operations";
import Button from "../../../components/common/Button";
import OperationalState from "../../../components/admin/OperationalState";
import { runtimeErrorState } from "../../../services/operationalRuntime";
export default function ProductContext() {
  const [params] = useSearchParams();
  const id = params.get("edit");
  const issue = params.get("issue");
  const [result, setResult] = useState({ id: null, item: null, state: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!id) return;
    let current = true;
    readOperationalRecord("products", id).then(item => { if (current) setResult({ id, item, state: item ? "success" : "unavailable" }); }).catch(error => { if (current) setResult({ id, item: null, state: runtimeErrorState(error) }); });
    return () => { current = false; };
  }, [id, attempt]);
  if (!id) return <Operations mode="source" onlyDomain="products" />;
  return <section className="admin-panel admin-stack"><h1>Product operational context</h1>{result.id !== id || result.state === "loading" ? <OperationalState state="loading" /> : result.item
    ? <><h2>{result.item.label}</h2><p>Publication state: {result.item.state}</p><p>{result.item.reason || "No actionable catalogue issue in the current source."}</p>{issue && <p role="status">{result.item.issueKeys?.includes(issue) ? "The linked catalogue issue remains current." : "Status changed since this issue link was created. Current Product context is shown; no obsolete action is retained."}</p>}<p>Read-only access. Product changes require independent current authority in the Product owner workspace.</p></>
    : <OperationalState state={result.state} onRetry={() => { setResult({ id, item: null, state: "loading" }); setAttempt(value => value + 1); }} />}<Button to="/admin/attention" variant="secondary">Return to Attention Centre</Button></section>;
}
