import { useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../../firebase/auth";
import { accountRequest } from "../../services/accountApi";
import { revalidateProduct } from "../../services/products";
import { formatNaira } from "../../utils/formatters";
import Button from "../../components/common/Button";
import { usePrincipalFence } from "../../hooks/usePrincipalFence";
import { ownerErrorCopy, ownerErrorState, readOperationMarker, writeOperationMarker, clearOperationMarker } from "../../services/ownerOperation";
import SourceStatus from "../../components/common/SourceStatus";
export default function CatalogueIntake({lines}){
  const marker=`udc:catalogue-intake:${auth.currentUser?.uid}`;
  const[review,setReview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[state,setState]=useState("ready"),[orderId,setOrderId]=useState(null),[unknown,setUnknown]=useState(()=>readOperationMarker(marker)?.operationId||null);
  const fence=usePrincipalFence(marker,()=>{setReview(null);setOrderId(null);setBusy(false);setState("restricted");setError("Current account access must be checked before proceeding.");});
  if(!lines.length)return null;
  async function prepare(){const ticket=fence.begin();setBusy(true);setState("checking");setError("Checking current selections and access…");try{
    const context=await accountRequest("context",{},{principalUid:ticket.uid});if(!context.authorized)throw Object.assign(Error(),{code:"permission-denied"});
    const current=await Promise.all(lines.map(async line=>{const product=await revalidateProduct(line.productId);if(!product)throw Object.assign(Error(),{code:"product-state-changed"});return{product,quantity:line.quantity,selections:line.selections};}));if(fence.current(ticket)){setReview(current);setState("ready");setError("Current selections checked. No new Order was created by this check.");}
  }catch(reason){if(fence.current(ticket)){setState(ownerErrorState(reason));setError(ownerErrorCopy(reason,"Current selections"));}}finally{if(fence.current(ticket))setBusy(false);}}
  async function create(){if(!review||busy||unknown)return;const ticket=fence.begin(),operationId=crypto.randomUUID();setBusy(true);setState("saving");setError("Creating the reviewed transaction…");try{writeOperationMarker(marker,{operationId});const result=await accountRequest("catalogue-order",{operationId,items:review.map(row=>({productId:row.product.id,quantity:row.quantity,selections:row.selections,expectedPublicVersion:row.product.publicVersion}))},{principalUid:ticket.uid});if(fence.current(ticket)){clearOperationMarker(marker);setOrderId(result.orderId);setState("saved");setError("Order creation confirmed. Payment and approvals remain separate.");}}
    catch(reason){if(fence.current(ticket)){const resultState=ownerErrorState(reason);setState(resultState);setError(ownerErrorCopy(reason,"Order creation"));if(resultState==="unknown-result")setUnknown(operationId);else{clearOperationMarker(marker);setReview(null);}}}finally{if(fence.current(ticket))setBusy(false);}}
  async function check(){if(!unknown||busy)return;const ticket=fence.begin();setBusy(true);setState("checking-result");setError("Checking the original Order creation outcome…");try{const result=await accountRequest("transaction-operation",{operationId:unknown},{principalUid:ticket.uid});if(!fence.current(ticket))return;if(result.state==="committed"){clearOperationMarker(marker);setUnknown(null);setOrderId(result.orderId);setState("saved");setError("Order creation confirmed.");}else{setState("unknown-result");setError("The Order outcome is still unconfirmed. Creation has not been repeated.");}}catch(reason){if(fence.current(ticket)){setState("unknown-result");setError(ownerErrorCopy(reason,"The Order outcome"));}}finally{if(fence.current(ticket))setBusy(false);}}
  return <section aria-label="Current catalogue Order intake"><p>Review current catalogue values before creating a transaction. This does not submit a Payment or replace approval gates.</p><SourceStatus state={state}>{error}</SourceStatus>{orderId?<Link to={`/my-closet/orders/${orderId}`}>Open your created Order</Link>:unknown?<Button disabled={busy} onClick={check}>Check Order outcome</Button>:review?<><ul>{review.map(row=><li key={row.product.id}>{row.product.name} · Quantity {row.quantity} · {formatNaira(row.product.price)}</li>)}</ul><Button disabled={busy} onClick={create}>Create Order from reviewed selections</Button></>:<Button disabled={busy} variant="secondary" onClick={prepare}>Review current selections</Button>}</section>;
}
