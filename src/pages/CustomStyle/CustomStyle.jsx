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
import { usePrincipalFence } from "../../hooks/usePrincipalFence";
import { ownerErrorCopy, ownerErrorState, readOperationMarker, writeOperationMarker, clearOperationMarker } from "../../services/ownerOperation";

export default function CustomStyle() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const resolved = useCustomerSession();
  const { requestAuth } = useAuthGate();
  const [sourceState, setState] = useState({ uid: user?.uid, status: "local", message: "" });
  const pending = useRef(null), saved = useRef(null);
  const marker = `udc:custom-style-intent:${user?.uid}`;
  const restored = user ? readOperationMarker(marker) : null;
  const prepared = location.state?.customStyle || {};
  const [storedDraft, setStoredDraft] = useState(() => ({ uid: user?.uid || null, idea: prepared.idea || "", fabric: prepared.fabric || "", occasion: prepared.occasion || "" }));
  const draft = storedDraft.uid && storedDraft.uid !== user?.uid ? { idea:"",fabric:"",occasion:"" } : storedDraft;
  const state = restored&&(sourceState.uid!==user.uid||["local","unknown"].includes(sourceState.status)) ? {uid:user.uid,status:"unknown",message:"An earlier request outcome is unconfirmed. Check it before saving again."} : sourceState.uid === user?.uid ? sourceState : {status:"local",message:""};
  const setDraft = update => setStoredDraft({...update(draft),uid:user?.uid||null});
  const fence=usePrincipalFence(`custom-style:${user?.uid||"guest"}`,()=>{if(storedDraft.uid)setStoredDraft({uid:null,idea:"",fabric:"",occasion:""});setState({uid:user?.uid,status:"local",message:"Current request access must be checked before continuing."});});
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
    if (restored || pending.current?.uid===user.uid || state.status === "pending") return;
    const uid = user.uid, ticket=fence.begin();
    setStoredDraft({...draft,uid});
    setState({ uid, status: "pending", message: "Saving your request…" });
    try {
      const account = await resolveCustomerAccount(user);
      if (!fence.current(ticket) || !account.authorized) return;
      const prior=saved.current?.uid===uid?saved.current.value:null;
      const input = { operationId: crypto.randomUUID(), expectedEpoch: account.epoch, expectedVersion: prior?.version || 0, ...(prior ? { requestId: prior.requestId } : {}), fields: { notes: idea, fabricPreferences: fabric, eventName: occasion } };
      writeOperationMarker(marker,{operationId:input.operationId});pending.current = { uid, input:{operationId:input.operationId} };
      const result = await saveCustomStyle(input);
      if (!fence.current(ticket)) return;
      saved.current = {uid,value:result}; pending.current = null;clearOperationMarker(marker);
      setState({ uid, status: "confirmed", message: "Your Custom Style request is saved. No Order or Payment has been created." });
    } catch (error) {
      if (!fence.current(ticket)) return;
      if (!["auth/outcome-unknown", "outcome-unknown"].includes(error.code)) {pending.current = null;clearOperationMarker(marker);}
      setState({ uid, status: pending.current ? "unknown" : ownerErrorState(error), message: pending.current ? "The result is not confirmed. Check the outcome before saving again." : ownerErrorCopy(error,"Your request")+" Your current local changes remain here." });
    }
  }
  async function checkOutcome() {
    const operation = pending.current?.uid===user?.uid?pending.current:restored?{uid:user.uid,input:restored}:null; if (!operation || auth.currentUser?.uid !== operation.uid) return;const ticket=fence.begin();
    try {
      const result = await reconcilePretransaction(operation.input.operationId);
      if (result.state !== "committed"){if(fence.current(ticket))setState({uid:operation.uid,status:"unknown",message:"The request is still unconfirmed. It has not been saved again."});return;}
      const current = await readCustomStyle(result.requestId);
      if (!fence.current(ticket)) return;
      saved.current = {uid:operation.uid,value:current}; pending.current = null;clearOperationMarker(marker);
      setState({ uid:operation.uid,status: "confirmed", message: "Your saved request has been confirmed. No Order or Payment has been created." });
    } catch(error) {if(fence.current(ticket))setState({uid:operation.uid,status:"unknown",message:ownerErrorCopy(error,"The request outcome")});}
  }
  if (user && (!resolved.user||auth.currentUser?.uid!==user.uid)||!user&&auth.currentUser) return <AccountAccessState state={resolved.accountState} onCheck={resolved.recheckCustomer} />;
  if(state.status==="restricted")return <AccountAccessState state="unavailable" onCheck={()=>{setState({uid:user?.uid,status:"local",message:""});resolved.recheckCustomer();}}/>;
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
        {state.status === "confirmed" && <Button variant="secondary" onClick={() => navigate("/chats", { state: { customStyleRequestId: saved.current?.uid===user?.uid?saved.current.value.requestId:null } })}>Discuss with a Couturier</Button>}
      </section>
      <div className="editorial-actions"><Button to="/chats" variant="secondary">Contact Dicta Couturier</Button><Button to="/shop" variant="ghost">Browse the shop</Button></div>
    </div>
  </>;
}
