import { runtimeStateMessage } from "../../services/operationalRuntime";
import Button from "../common/Button";
import AdminIcon from "./AdminIcon";
import { operationalPresentation } from "../../services/operationalPresentation";
export default function OperationalState({ state, message, onRetry, retrying = false }) {
  const retry = onRetry && ["connection-problem", "source-unavailable", "temporarily-unavailable", "retryable-error", "stale"].includes(state);
  const visual = operationalPresentation(state);
  return <div className={`admin-notice admin-state admin-state--${visual.tone}`} data-operational-state={state}>
    <AdminIcon name={visual.icon} className="admin-state__icon" />
    <div className="admin-state__body"><strong>{visual.title}</strong><p role={["restricted", "permission-denied"].includes(state) ? "alert" : "status"}>{message || runtimeStateMessage(state)}</p>{retry && <Button variant="secondary" isLoading={retrying} onClick={onRetry}>Retry current read</Button>}</div>
  </div>;
}
