import { useEffect } from "react";
import { doc,onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firestore";
// This signal only withdraws/revalidates; the owner feed remains authority.
export function useReviewPublicationGuard(entries,onWithdraw){
  const signature=entries.filter(entry=>entry.managed).map(entry=>entry.id).sort().join(',');
  useEffect(()=>{
    if(!db||!signature)return;
    let live=true;const stops=signature.split(',').map(id=>{let confirmed=false;return onSnapshot(doc(db,"reviewPublicState",id),{includeMetadataChanges:true},snapshot=>{if(!live)return;if(snapshot.metadata.fromCache){if(confirmed)onWithdraw();return;}confirmed=true;if(!snapshot.exists()||snapshot.data().publicAllowed!==true)onWithdraw();},()=>{if(live)onWithdraw();});});
    return()=>{live=false;stops.forEach(stop=>stop());};
  },[signature,onWithdraw]);
}
