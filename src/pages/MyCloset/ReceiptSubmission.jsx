import { useState } from "react";
import { auth } from "../../firebase/auth";
import { accountRequest } from "../../services/accountApi";
import Button from "../../components/common/Button";
import { usePrincipalFence } from "../../hooks/usePrincipalFence";
import { ownerErrorCopy, ownerErrorState, readOperationMarker, writeOperationMarker, clearOperationMarker } from "../../services/ownerOperation";
import SourceStatus from "../../components/common/SourceStatus";

export default function ReceiptSubmission({order,onChanged}){
  const scope=`${auth.currentUser?.uid}:${order.orderId}:${order.componentId}`, marker=`udc:receipt:${scope}`;
  const[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[state,setState]=useState("ready"),[pending,setPending]=useState(()=>readOperationMarker(marker));
  const fence=usePrincipalFence(scope,()=>{setState("restricted");setNotice("Current receipt access is unavailable. Return to the Order to check it.");});
  const remember=value=>{writeOperationMarker(marker,value);setPending(value);};
  const logicalId=value=>value.phase==="asset"?value.operationId.replace(/^asset-/,""):value.phase==="submit"||value.phase==="ready-submit"?value.operationId.replace(/^submit-/,""):value.operationId;
  async function finish(ticket,value){
    if(!fence.current(ticket))return;
    const next={operationId:`submit-${logicalId(value)}`,phase:"submit",paymentId:value.paymentId,assetId:value.assetId};remember(next);setState("saving");setNotice("Submitting the original receipt—not verified payment.");
    await accountRequest("payment-submit",{operationId:next.operationId,paymentId:next.paymentId,assetId:next.assetId},{principalUid:ticket.uid});
    if(fence.current(ticket)){clearOperationMarker(marker);setPending(null);setState("saved");setNotice("Receipt Submitted. Verification is separate.");onChanged();}
  }
  async function upload(ticket,value,file){
    const context=await accountRequest("context",{},{principalUid:ticket.uid});if(!fence.current(ticket))return;
    const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Object.assign(Error(),{code:"receipt-file-unavailable"}));reader.readAsDataURL(file);});if(!fence.current(ticket))return;
    const next={operationId:`asset-${logicalId(value)}`,phase:"asset",paymentId:value.paymentId};remember(next);setState("uploading");setNotice("Uploading private evidence. It is not submitted or verified yet.");
    const asset=await accountRequest("media-stage",{operationId:next.operationId,domain:"payment-proof",objectId:value.paymentId,expectedVersion:1,expectedEpoch:context.epoch,contentType:file.type,base64},{principalUid:ticket.uid});
    if(fence.current(ticket))await finish(ticket,{...next,assetId:asset.assetId});
  }
  function failed(ticket,reason){if(!fence.current(ticket))return;const saved=readOperationMarker(marker);
    if(reason.code==="invalid-media"&&saved?.phase==="asset"){remember({operationId:logicalId(saved),phase:"ready-asset",paymentId:saved.paymentId});setState("failed");setNotice("This image was not accepted. Choose a supported receipt to continue the original submission.");return;}
    setPending(saved);setState(ownerErrorState(reason));setNotice(ownerErrorCopy(reason,"This evidence step"));}
  async function submit(event){
    event.preventDefault();if(busy||state==="restricted"||pending&&!['ready-asset','ready-submit'].includes(pending.phase))return;
    const data=new FormData(event.currentTarget),file=data.get("receipt"),text=String(data.get("amount"));
    const needsFile=pending?.phase!=="ready-submit";
    if(needsFile&&(!file?.size||file.size>4*1024*1024||!["image/jpeg","image/png","image/webp"].includes(file.type))||!pending&&!/^\d+(\.\d{1,2})?$/.test(text)){setState("validation");setNotice("Enter an amount and a JPEG, PNG or WebP receipt up to 4 MB.");return;}
    const ticket=fence.begin();setBusy(true);
    try{
      if(pending?.phase==="ready-submit")await finish(ticket,pending);
      else if(pending?.phase==="ready-asset")await upload(ticket,pending,file);
      else{
        const value={operationId:crypto.randomUUID(),phase:"intent"};remember(value);setState("saving");setNotice("Checking the exact payable context…");
        const intent=await accountRequest("payment-intent",{operationId:value.operationId,orderId:order.orderId,componentId:order.componentId,expectedVersion:order.version,expectedEdition:order.currentEdition,amountMinor:Math.round(Number(text)*100)},{principalUid:ticket.uid});if(!fence.current(ticket))return;
        const next={...value,phase:"ready-asset",paymentId:intent.paymentId};remember(next);await upload(ticket,next,file);
      }
    }catch(reason){failed(ticket,reason);}finally{if(fence.current(ticket))setBusy(false);}
  }
  async function check(){
    if(!pending||busy)return;const ticket=fence.begin();setBusy(true);setState("checking-result");setNotice("Checking the original evidence step…");
    try{
      const result=await accountRequest(pending.phase==="asset"?"media-stage-reconcile":"transaction-operation",{operationId:pending.operationId},{principalUid:ticket.uid});if(!fence.current(ticket))return;
      if(pending.phase==="submit"&&result.state==="committed"){clearOperationMarker(marker);setPending(null);setState("saved");setNotice("Receipt Submitted. Verification is separate.");onChanged();}
      else if(pending.phase==="intent"&&result.state==="committed"&&result.paymentId){remember({...pending,phase:"ready-asset",paymentId:result.paymentId});setState("ready");setNotice("The original payable context is confirmed. Choose the receipt to continue this same submission.");}
      else if(pending.phase==="asset"&&result.state==="staged"){remember({operationId:`submit-${logicalId(pending)}`,phase:"ready-submit",paymentId:pending.paymentId,assetId:result.assetId});setState("ready");setNotice("Private evidence upload is confirmed. Continue this same receipt; it is not submitted or verified yet.");}
      else if(result.state==="stale"){setState("stale");setNotice("The upload context changed. Check the current Order before proceeding; no receipt was repeated.");}
      else{setState("unknown-result");setNotice("This evidence step is still unconfirmed. Do not start another submission for this intended receipt.");}
    }catch(reason){failed(ticket,reason);}finally{if(fence.current(ticket))setBusy(false);}
  }
  const resumable=['ready-asset','ready-submit'].includes(pending?.phase);
  return <section aria-label="Bank Transfer evidence"><h2>Submit bank-transfer receipt</h2><p>Use verified studio bank instructions. This form records evidence only and does not transfer funds.</p>
    <SourceStatus id="receipt-status" state={state}>{notice}</SourceStatus>
    {state!=="restricted"&&<form onSubmit={submit} aria-describedby="receipt-status"><fieldset disabled={busy||Boolean(pending)&&!resumable} style={{border:0,padding:0}}>
      {!pending&&<><label htmlFor="receipt-amount">Transfer amount (NGN)</label><input id="receipt-amount" name="amount" inputMode="decimal" aria-describedby="receipt-status" aria-invalid={state==="validation"||undefined} required/></>}
      {pending?.phase!=="ready-submit"&&<><label htmlFor="receipt-file">Private receipt image</label><input id="receipt-file" name="receipt" type="file" aria-describedby="receipt-status" aria-invalid={state==="validation"||state==="failed"||undefined} accept="image/jpeg,image/png,image/webp" required/></>}
      <Button type="submit" disabled={busy}>{resumable?"Continue this receipt":"Submit receipt"}</Button>
    </fieldset></form>}{pending&&!resumable&&<Button variant="secondary" disabled={busy} onClick={check}>Check evidence outcome</Button>}
  </section>;
}
