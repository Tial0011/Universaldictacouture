import PageIntro from "../../components/common/PageIntro";
import Button from "../../components/common/Button";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useAuthGate } from "../../context/AuthGateContext";
import EditorialSections from "../../components/common/EditorialSections";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import { useRef, useState } from "react";
import { resolveCustomerAccount } from "../../services/accountApi";
import { saveCustomStyle, readCustomStyle, reconcilePretransaction } from "../../services/pretransaction";
import { auth } from "../../firebase/auth";
import { useCustomerSession } from "../../hooks/useCustomerSession";
import { AccountAccessState } from "../../components/account/AccountVisuals";

export default function CustomStyle() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const resolved = useCustomerSession();
  const { requestAuth } = useAuthGate();
  const [state, setState] = useState({ status: "local", message: "" });
  const pending = useRef(null), saved = useRef(null);
  const prepared = location.state?.customStyle || {};
  const [draft, setDraft] = useState(() => ({ idea: prepared.idea || "", fabric: prepared.fabric || "", occasion: prepared.occasion || "" }));
  useDocumentMeta({ title: "Custom Style | Universal Dicta Couture", description: "Share your style, fabric and fit preferences with a Dicta Couturier and start your custom enquiry.", canonicalPath: "/custom-style" });
  async function prepareEnquiry(event) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const idea = String(values.get("idea") || "").trim();
    if (!idea) { event.currentTarget.elements.idea.focus(); return; }
    const fabric = String(values.get("fabric") || "").trim();
    const occasion = String(values.get("occasion") || "").trim();
    if (!user) {
      requestAuth({ returnTo: "/custom-style", returnState: { customStyle: { idea, fabric, occasion } } });
      return;
    }
    if (pending.current || state.status === "pending") return;
    const uid = user.uid;
    setState({ status: "pending", message: "Saving your request…" });
    try {
      const account = await resolveCustomerAccount(user);
      if (auth.currentUser?.uid !== uid || !account.authorized) throw Error("Access changed");
      const input = { operationId: crypto.randomUUID(), expectedEpoch: account.epoch, expectedVersion: saved.current?.version || 0, ...(saved.current ? { requestId: saved.current.requestId } : {}), fields: { notes: idea, fabricPreferences: fabric, eventName: occasion } };
      pending.current = { uid, input };
      const result = await saveCustomStyle(input);
      if (auth.currentUser?.uid !== uid) return;
      saved.current = result; pending.current = null;
      setState({ status: "confirmed", message: "Your Custom Style request is saved. No Order or Payment has been created." });
    } catch (error) {
      if (auth.currentUser?.uid !== uid) return;
      if (!["auth/outcome-unknown", "outcome-unknown"].includes(error.code)) pending.current = null;
      setState({ status: pending.current ? "unknown" : "failed", message: pending.current ? "The result is not confirmed. Check the outcome before saving again." : "Your request could not be saved. Your local changes remain here." });
    }
  }
  async function checkOutcome() {
    const operation = pending.current; if (!operation || auth.currentUser?.uid !== operation.uid) return;
    try {
      const result = await reconcilePretransaction(operation.input.operationId);
      if (result.state !== "committed") return;
      const current = await readCustomStyle(result.requestId);
      if (auth.currentUser?.uid !== operation.uid) return;
      saved.current = current; pending.current = null;
      setState({ status: "confirmed", message: "Your saved request has been confirmed. No Order or Payment has been created." });
    } catch { /* Still unknown: preserve the operation, never replay it. */ }
  }
  if (user && !resolved.user) return <AccountAccessState state={resolved.accountState} onCheck={resolved.recheckCustomer} />;
  return <>
    <PageIntro title="Custom Style" description="Discuss your preferred style, fabric and measurements with Dicta Couturier." />
    <div className="container editorial-content">
      <EditorialSections sections={[
        { title: "01 — Choose a direction", body: "Start with a style, a fabric, an occasion, or an idea you would like to explore." },
        { title: "02 — Share the details", body: "Tell your couturier about your preferred look, measurements and any date or requirements that matter to you." },
        { title: "03 — Confirm together", body: "Discuss the fabric, fit, cost, delivery and timing before deciding how to proceed." },
      ]} />
      <section className="custom-enquiry" aria-labelledby="custom-enquiry-title">
        <h2 id="custom-enquiry-title">Tell us what you have in mind</h2>
        <p>Save your request securely, then discuss it with a Couturier. This is not checkout.</p>
        <p role="status" aria-live="polite">{state.message}</p>
        <form onSubmit={prepareEnquiry}>
          <fieldset disabled={state.status === "pending" || state.status === "unknown"} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="field"><label htmlFor="custom-idea">Your idea</label><textarea id="custom-idea" name="idea" rows={5} required maxLength={1400} value={draft.idea} onChange={event => setDraft(current => ({ ...current, idea: event.target.value }))} placeholder="Describe the style or look you would like to create." /></div>
          <div className="field"><label htmlFor="custom-fabric">Fabric or pattern preference (optional)</label><input id="custom-fabric" name="fabric" maxLength={150} value={draft.fabric} onChange={event => setDraft(current => ({ ...current, fabric: event.target.value }))} /></div>
          <div className="field"><label htmlFor="custom-occasion">Occasion or preferred date (optional)</label><input id="custom-occasion" name="occasion" maxLength={150} value={draft.occasion} onChange={event => setDraft(current => ({ ...current, occasion: event.target.value }))} /></div>
          <Button type="submit">{state.status === "pending" ? "Saving…" : "Save Custom Style request"}</Button>
          </fieldset>
        </form>
        {state.status === "unknown" && <Button variant="secondary" onClick={checkOutcome}>Check outcome</Button>}
        {state.status === "confirmed" && <Button variant="secondary" onClick={() => navigate("/chats", { state: { customStyleRequestId: saved.current?.requestId } })}>Discuss with a Couturier</Button>}
      </section>
      <div className="editorial-actions"><Button to="/chats" variant="secondary">Contact Dicta Couturier</Button><Button to="/shop" variant="ghost">Browse the shop</Button></div>
    </div>
  </>;
}
