export default function SourceStatus({ state = "checking", children, id }) {
  return <p id={id} role={state === "restricted" ? "alert" : "status"} aria-live={state === "restricted" ? "assertive" : "polite"} aria-atomic="true" data-source-state={state}>{children}</p>;
}
