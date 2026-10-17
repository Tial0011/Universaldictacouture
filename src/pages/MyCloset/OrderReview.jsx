import { useState } from "react";
import { accountRequest } from "../../services/accountApi";
import Button from "../../components/common/Button";
import { auth } from "../../firebase/auth";
import { usePrincipalFence } from "../../hooks/usePrincipalFence";
import { ownerErrorCopy, ownerErrorState, readOperationMarker, writeOperationMarker, clearOperationMarker } from "../../services/ownerOperation";
import SourceStatus from "../../components/common/SourceStatus";
export default function OrderReview({order}){
  const marker=`udc:review-intent:${auth.currentUser?.uid}:${order.orderId}`;
  const[busy,setBusy]=useState(false),[result,setResult]=useState(null),[notice,setNotice]=useState(""),[state,setState]=useState("ready"),[unknown,setUnknown]=useState(()=>readOperationMarker(marker)?.operationId||null);
  const fence=usePrincipalFence(`${auth.currentUser?.uid}:${order.orderId}`,()=>{setResult(null);setState("restricted");setNotice("Current Review access is unavailable. Check the Order before continuing.");});
  function failed(ticket,reason,operationId){if(!fence.current(ticket))return;const value=ownerErrorState(reason);setState(value);setNotice(ownerErrorCopy(reason,"This Review action"));if(value==="unknown-result")setUnknown(operationId);else clearOperationMarker(marker);}
  async function submit(event){event.preventDefault();if(busy||unknown||state==="restricted")return;const data=new FormData(event.currentTarget),operationId=crypto.randomUUID(),ticket=fence.begin();setBusy(true);setState("saving");setNotice("Saving this Review privately…");try{
    writeOperationMarker(marker,{operationId});const record=await accountRequest("review-submit",{operationId,orderId:order.orderId,expectedVersion:order.version,body:String(data.get("body")),customerServiceRating:Number(data.get("service")),productQualityRating:Number(data.get("quality"))},{principalUid:ticket.uid});
    if(fence.current(ticket)){setResult(record);clearOperationMarker(marker);setState("saved");setNotice("Review saved privately. Publication and reuse permissions are separate.");}
  }catch(reason){failed(ticket,reason,operationId);}finally{if(fence.current(ticket))setBusy(false);}}
  async function permission(){if(busy||!result||unknown||state==="restricted")return;const operationId=crypto.randomUUID(),ticket=fence.begin();setBusy(true);setState("saving");setNotice("Recording publication permission…");try{
    writeOperationMarker(marker,{operationId});const next=await accountRequest("review-change",{operationId,reviewId:result.reviewId,expectedVersion:result.version,action:"permission",scope:"publication",allowed:true},{principalUid:ticket.uid});
    if(fence.current(ticket)){setResult(next);clearOperationMarker(marker);setState("saved");setNotice("Publication permission recorded. Moderation and publication still require separate authorized actions. No promotional or Product reuse permission was granted.");}
  }catch(reason){failed(ticket,reason,operationId);}finally{if(fence.current(ticket))setBusy(false);}}
  async function check(){if(busy||!unknown)return;const ticket=fence.begin();setBusy(true);setState("checking-result");setNotice("Checking the original Review outcome…");try{
    const value=await accountRequest("transaction-operation",{operationId:unknown},{principalUid:ticket.uid});if(!fence.current(ticket))return;
    if(value.state==="committed"){clearOperationMarker(marker);setResult(value);setUnknown(null);setState("saved");setNotice("Review action confirmed; publication remains separate.");}else{setState("unknown-result");setNotice("The Review action is still unconfirmed. It has not been repeated.");}
  }catch(reason){if(fence.current(ticket)){setState("unknown-result");setNotice(ownerErrorCopy(reason,"The Review outcome"));}}finally{if(fence.current(ticket))setBusy(false);}}
  return <section aria-label="Order review"><h2>Review your experience</h2><SourceStatus id="order-review-status" state={state}>{notice}</SourceStatus>{state!=="restricted"&&(result?<Button disabled={busy||Boolean(unknown)} onClick={permission}>Allow publication of this Review</Button>:<form onSubmit={submit} aria-describedby="order-review-status"><fieldset disabled={busy||Boolean(unknown)} style={{border:0,padding:0}}><label htmlFor="order-review-body">Your review</label><textarea id="order-review-body" name="body" aria-describedby="order-review-status" rows={5} maxLength={4000} required/>{["service","quality"].map(dimension=><div key={dimension}><label htmlFor={`review-${dimension}`}>{dimension==="service"?"Service":"Quality"} rating</label><select id={`review-${dimension}`} name={dimension} required defaultValue=""><option value="" disabled>Choose 1–5</option>{[1,2,3,4,5].map(value=><option key={value} value={value}>{value}</option>)}</select></div>)}<Button type="submit">Submit private Review</Button></fieldset></form>)}{unknown&&<Button disabled={busy} onClick={check}>Check Review outcome</Button>}</section>;
}
