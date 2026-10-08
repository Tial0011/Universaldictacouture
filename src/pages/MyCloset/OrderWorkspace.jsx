import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { accountRequest } from "../../services/accountApi";
import Button from "../../components/common/Button";
import TransactionConversation from "../../components/chat/TransactionConversation";
import { formatNaira } from "../../utils/formatters";
import { auth } from "../../firebase/auth";
import ReceiptSubmission from "./ReceiptSubmission";
import OrderReview from "./OrderReview";
import { usePrincipalFence } from "../../hooks/usePrincipalFence";
import { ownerErrorCopy, ownerErrorState, readOperationMarker, writeOperationMarker, clearOperationMarker } from "../../services/ownerOperation";
import SourceStatus from "../../components/common/SourceStatus";
import { useStaff } from "../../context/StaffContext";
import { allows } from "../../services/staffAuthorization";
export default function OrderWorkspace({ staff = false }) {
  const { orderId } = useParams(), [params] = useSearchParams(), componentId = params.get("work") || "base";
  const scope = `${auth.currentUser?.uid}:${staff}:${orderId}:${componentId}`, marker = `udc:order-action:${scope}`;
  const [source,setSource] = useState(null), [notice,setNotice] = useState({state:"checking",text:"Checking current Order access…"}), [busy,setBusy] = useState(false), [pendingState,setPendingState] = useState(()=>({scope,value:readOperationMarker(marker)})), [attempt,setAttempt] = useState(0), [receiptNotice,setReceiptNotice] = useState(null);
  const pending=pendingState.scope===scope?pendingState.value:readOperationMarker(marker);
  const setPending=useCallback(value=>setPendingState({scope,value}),[scope]);
  const staffContext=useStaff();
  const fence = usePrincipalFence(scope, () => { setSource(null);setBusy(false); setNotice({state:"restricted",text:"Checking current access. Private Order information is unavailable."}); });
  const current = source?.scope === scope ? source.value : null;
  useEffect(()=>{
    const ticket=fence.begin(); let active=true;
    queueMicrotask(()=>{if(active){setSource(null);setNotice({state:"checking",text:"Checking current Order access…"});setPending(readOperationMarker(marker));}});
    accountRequest(staff?"staff-order":"order",{orderId,componentId},{principalUid:ticket.uid}).then(value=>{
      if(active&&fence.current(ticket)){setSource({scope,value});setNotice({state:"ready",text:"Current Order checked."});}
    }).catch(reason=>{if(active&&fence.current(ticket)){setSource(null);setNotice({state:ownerErrorState(reason),text:ownerErrorCopy(reason,"Current Order information")});}});
    return()=>{active=false;fence.invalidate();};
  },[scope,marker,orderId,componentId,staff,attempt,fence,setPending]);
  async function action(name) {
    if (!current || current.orderId !== orderId || current.componentId !== componentId || busy || pending) return;
    if (name === "customer-approve" && !window.confirm("Approve this exact current Edition? This does not submit a Payment.")) return;
    const ticket=fence.begin(),operationId=crypto.randomUUID();setBusy(true);setNotice({state:"saving",text:"Checking and saving this exact action…"});
    try {
      writeOperationMarker(marker,{operationId});
      await accountRequest(staff?"staff-commercial":"commercial",{orderId,componentId,expectedVersion:current.version,expectedEdition:current.currentEdition,action:name,operationId},{principalUid:ticket.uid});
      if(fence.current(ticket)){clearOperationMarker(marker);setBusy(false);setAttempt(v=>v+1);}
    } catch(reason){if(fence.current(ticket)){
      const state=ownerErrorState(reason);setNotice({state,text:ownerErrorCopy(reason,"This Order action")});
      if(state==="unknown-result")setPending({operationId});else clearOperationMarker(marker);
      if(["restricted","stale"].includes(state))setSource(null);setBusy(false);
    }}
  }
  async function check(){if(!pending||busy)return;const ticket=fence.begin();setBusy(true);setNotice({state:"checking-result",text:"Checking the original action outcome…"});try{
    const result=await accountRequest("transaction-operation",{operationId:pending.operationId},{principalUid:ticket.uid});if(!fence.current(ticket))return;
    if(result.state==="committed"){clearOperationMarker(marker);setPending(null);setBusy(false);setAttempt(v=>v+1);}else{setNotice({state:"unknown-result",text:"The action is still unconfirmed. It has not been repeated."});setBusy(false);}
  }catch(reason){if(fence.current(ticket)){setNotice({state:"unknown-result",text:ownerErrorCopy(reason,"The original action outcome")});setBusy(false);}}}
  const reload=()=>{fence.invalidate();setSource(null);setBusy(false);setAttempt(value=>value+1);};
  return <section className="container section"><h1>Order</h1>
    <SourceStatus state={notice.state}>{notice.text}</SourceStatus>
    <Button variant="secondary" disabled={busy} onClick={reload}>Check current Order</Button>
    {pending&&<Button disabled={busy} onClick={check}>Check outcome</Button>}
    {current&&current.orderId===orderId&&current.componentId===componentId&&<>
    {receiptNotice?.scope===scope&&<SourceStatus state="saved">{receiptNotice.text}</SourceStatus>}
    <p>One transaction · viewing {componentId === "base" ? "Base" : "Extension"} · Edition {current.currentEdition || "not yet established"}</p><p>{current.status} · {current.fulfilment} · {current.delivery}</p>
    {current.currentWork!==componentId&&<p>Current work is separate from this historical view. <Link to={`?work=${encodeURIComponent(current.currentWork)}`}>View current work</Link></p>}
    {current.edition?.entries.map(entry=><div className="surface surface--padded" key={entry.rootId}><h2>{entry.label}</h2><p>Quantity: {entry.quantity} · {formatNaira(entry.unitAmountMinor/100)}</p></div>)}
    <dl><dt>Amount Due Now</dt><dd>{current.amountDueNowMinor==null?"Not established":formatNaira(current.amountDueNowMinor/100)}</dd><dt>Verified paid</dt><dd>{formatNaira(current.totalPaidMinor/100)}</dd><dt>Outstanding</dt><dd>{current.outstandingMinor==null?"Not established":formatNaira(current.outstandingMinor/100)}</dd></dl>
    {!staff&&current.currentEdition>0&&current.businessApproval?.edition===current.currentEdition&&!current.customerApproval&&<Button disabled={busy||Boolean(pending)} onClick={()=>action("customer-approve")}>Approve current Edition</Button>}
    {staff&&allows(staffContext?.staff,"orders.enable-payment",{purpose:"order-operations",objectId:orderId,assignedStaffId:current.assignedStaffId,action:"enable-payment",state:current.status})&&current.customerApproval?.edition===current.currentEdition&&!current.paymentEnabled&&<Button disabled={busy||Boolean(pending)} onClick={()=>action("enable-payment")}>Enable Payment</Button>}
    <p>Bank Transfer only. Submitted evidence is not verified paid value. Payment does not complete this Order.</p>
    {!staff&&current.paymentEnabled&&!current.cancelled&&!current.completed&&current.amountDueNowMinor>0&&<ReceiptSubmission key={scope} order={current} onChanged={()=>{setReceiptNotice({scope,text:"Receipt Submitted. Verification is separate."});setAttempt(value=>value+1);}}/>}
    {!staff&&current.completed&&current.reviewEnabled&&current.currentWork==="base"&&<OrderReview key={scope} order={current}/>}
    <TransactionConversation key={scope+current.chatId} chatId={current.chatId} staff={staff}/>
    </>}
  </section>;
}
