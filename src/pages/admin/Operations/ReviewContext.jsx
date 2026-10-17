import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { readOperationalRecord } from "../../../services/operations";
import Operations from "./Operations";
import Button from "../../../components/common/Button";
import OperationalState from "../../../components/admin/OperationalState";
import { runtimeErrorState } from "../../../services/operationalRuntime";
export default function ReviewContext() {
  const [params] = useSearchParams();
  const id = params.get("record");
  const [result, setResult] = useState({ id: null, context: null, state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const context = result.id === id ? result.context : null;
  const state = result.id === id ? result.state : "loading";
  useEffect(() => {
    if (!id) return;
    let current = true;
    readOperationalRecord("reviews", id).then(item => { if (current) setResult({ id, context: item, state: item ? "success" : "unavailable" }); })
      .catch(error => { if (current) setResult({ id, context: null, state: runtimeErrorState(error) }); });
    return () => { current = false; };
  }, [id, attempt]);
  if (!id) return <Operations mode="source" onlyDomain="reviews" />;
  return <section className="admin-panel admin-stack"><h1>Review operational context</h1>
    {state === "loading" ? <OperationalState state="loading" />
      : context ? <><p>Current owner state: {context.state}</p><p>Service ratings use Shopping Experience, Customer Service Experience and Dicta Couturier Experience. Legacy quality ratings have not been reinterpreted.</p><p role="status">Protected moderation is unavailable until the Review owner provides consent, version, audit and current-state enforcement. Review publication, promotional reuse, Product Draft consent and optional marketing communication remain four independent permissions. Private media is not retrieved here; publication or a media reference does not authorize another purpose.</p></>
        : <OperationalState state={state} onRetry={() => { setResult({ id, context: null, state: "loading" }); setAttempt(value => value + 1); }} />}
    <Button to="/admin/attention" variant="secondary">Return to Attention Centre</Button></section>;
}
