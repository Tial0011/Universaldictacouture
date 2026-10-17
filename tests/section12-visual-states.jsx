import { createRoot } from "react-dom/client";
import OperationalState from "../src/components/admin/OperationalState";
import { OPERATIONAL_STATES } from "../src/services/operationalRuntime";
import "../src/styles/global.css";
import "../src/components/navigation/AdminLayout.css";
import "../src/components/admin/AdminVisual.css";
if (import.meta.env.MODE !== "section12-test" || !["127.0.0.1", "localhost"].includes(location.hostname)) throw Error("Local visual QA only");
// Actual production components, not business records or synthetic owner workflows.
createRoot(document.getElementById("root")).render(<main className="admin-layout"><div className="admin-layout__content admin-stack"><h1>Operational state family</h1><p>Local presentation checks only. No private data, authorization or business action.</p>{OPERATIONAL_STATES.map(state => <section className="admin-stack" key={state}><h2>{state}</h2><OperationalState state={state} onRetry={() => {}} /></section>)}</div></main>);
