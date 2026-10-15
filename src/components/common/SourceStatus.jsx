import { semanticState } from "../../services/operationalRuntime";

export default function SourceStatus({ state = "checking", children, id }) {
  return <div id={id} role={state === "restricted" ? "alert" : "status"} aria-live={state === "restricted" ? "assertive" : "polite"} aria-atomic="true" data-source-state={state} data-semantic-state={semanticState(state)}>{children}</div>;
}
