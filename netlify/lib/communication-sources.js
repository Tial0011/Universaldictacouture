import { completeStaffRoute, resolveStaffIdentity } from './staff-authority.js';
import { authorizationRoutes } from '../../src/services/staffAuthorization.js';

// Explicit semantic admissions from already committed native owner commands.
// No document-change hook, arbitrary recipient query or UI notification action.
export function nativeCommunicationPolicies(account) {
  const { ref, now }=account;
  async function source(tx,event) {
    if(event.domain!=='transaction'||event.executor!=='system:transaction-api')return null;
    const receipt=(await tx.get(ref(`transactionOperations/${event.operationId}`))).data();
    if(!receipt||receipt.state!=='committed'||receipt.action!==event.action||receipt.target!==event.target)return null;
    const result=receipt.result;
    const payment=result.paymentId?(await tx.get(ref(`payments/${result.paymentId}`))).data():null;
    if(event.action==='payment.review') {
      const decision=payment?.verifiedDecisionId?(await tx.get(ref(`paymentDecisions/${payment.verifiedDecisionId}`))).data():null;
      if(result.paymentState!=='VERIFIED'||!decision||decision.decision!=='VERIFIED'||decision.paymentId!==payment.paymentId||decision.proofReferenceId!==payment.proofReferenceId||decision.verifiedAmountMinor!==payment.verifiedAmountMinor)return null;
    }
    const orderId=result.orderId||payment?.orderId;if(!orderId)return null;
    const order=(await tx.get(ref(`orders/${orderId}`))).data();if(order?._ownerVersion!==3)return null;
    const componentId=result.componentId||payment?.componentId||order.currentWork||'base',work=(await tx.get(ref(`orders/${orderId}/work/${componentId}`))).data();
    return{receipt,result,payment,order,work,componentId};
  }
  function intent(event,s,domain,family,taxonomy,purpose,recipientIds) {
    const templateId=`template:s15:${domain}:${family}`;
    const reference=s.order.publicReference||'Your UDC order';
    const context=family==='information'?{approved_source_reference:reference}:{order_reference:reference};
    return{purpose,domain,taxonomy,templateId,source:{orderId:s.order.orderId,componentId:s.componentId,edition:s.work?.currentEdition||0,paymentId:s.payment?.paymentId||null},sourceVersion:s.result.version,privacyClass:'TRANSACTION SAFE',mandatory:domain==='customer',optionalPreference:null,consentRequired:false,channels:[{channel:'in-app',policy:'REQUIRED'},{channel:'email',policy:'REQUIRED'}],recipientIds,context,policyVersion:'s15-native-v1'};
  }
  const policy={
    qualify:async(tx,event)=>{
      const s=await source(tx,event);if(!s||!s.work)return[];
      if(event.action==='commercial.business-approve'&&s.work.currentEdition===s.result.edition&&s.work.businessApproval?.edition===s.work.currentEdition&&!s.work.customerApproval)return[intent(event,s,'customer','action','ACTION REQUIRED','order-approval',[s.order.accountId])];
      if(event.action==='payment.review'&&s.payment?.state==='VERIFIED'&&s.payment.version===s.result.version)return[intent(event,s,'customer','transaction','TRANSACTION UPDATE','payment-review',[s.order.accountId])];
      if(['operations.claim','operations.transfer'].includes(event.action)&&s.order.version===s.result.version&&s.order.assignedStaffId)return[intent(event,s,'staff','information','INFORMATION','assignment-awareness',[s.order.assignedStaffId]),intent(event,s,'customer','information','INFORMATION','couturier-assignment',[s.order.accountId])];
      return[];
    },
    current:async(tx,event,intent,recipientId)=>{
      const s=await source(tx,event);if(!s?.work)return{unknown:true,applicable:false};
      if(intent.domain==='customer'&&s.order.accountId!==recipientId)return{applicable:false};
      if(intent.domain==='staff'){
        const registry=(await tx.get(ref(`staffIdentities/${recipientId}`))).data(),staff=registry?.principalUid?(await tx.get(ref(`admins/${registry.principalUid}`))).data():null;
        if(s.order.assignedStaffId!==recipientId||!staff?.active||!staff.functionAsCouturier||!staff.eligible)return{applicable:false};
        // Background routing is not a human session. It consumes current source
        // responsibility and explicit notification capability, not a fake login.
        const complete=(capability,purpose,objectId,assignedStaffId,state)=>authorizationRoutes(staff,capability,purpose).some(route=>{
          if(route.actions&&(!Array.isArray(route.actions)||!route.actions.includes('read')))return false;
          if(route.states&&(!Array.isArray(route.states)||!route.states.includes(state)))return false;
          if(route.family==='domainWide')return true;
          if(route.family==='selectedObject')return Array.isArray(route.ids)&&route.ids.includes(objectId);
          return route.family==='assignmentDerived'&&assignedStaffId===staff.staffId&&staff.functionAsCouturier&&staff.eligible;
        });
        if(!complete('notifications.read','personal-notifications',recipientId,null,'ACTIVE')||!complete('orders.read','order-operations',s.order.orderId,s.order.assignedStaffId,s.order.status)||event.committedAt<=Math.max(staff.validAfter||0,registry.validAfter||0)*1000)return{applicable:false};
      }
      const approval=intent.purpose==='order-approval';
      return{applicable:!s.work.cancelled&&(!approval||s.work.currentEdition===intent.source.edition&&s.work.businessApproval?.edition===s.work.currentEdition&&s.work.customerApproval?.edition!==s.work.currentEdition),consent:true,route:`${intent.domain==='staff'?'/admin/orders/':'/my-closet/orders/'}${encodeURIComponent(s.order.orderId)}?component=${encodeURIComponent(s.componentId)}`};
    },
    presentation:async(tx,event,intent,claims,owner)=>{
      const s=await source(tx,event);if(!s)return{visibility:'MINIMIZED',actionability:'ACTIONABILITY_UNCONFIRMED',route:null};
      let authorized=false;
      if(owner.domain==='customer')authorized=owner.recipientId===s.order.accountId;
      else {
        const staff=await resolveStaffIdentity(tx,account.db,claims,now());
        authorized=completeStaffRoute(staff,{capability:'orders.read',purpose:'order-operations',objectId:s.order.orderId,assignedStaffId:s.order.assignedStaffId,state:s.order.status,action:'read'},claims,now());
      }
      if(!authorized)return{visibility:'MINIMIZED',actionability:'ACCESS LOST',route:null};
      const current=await policy.current(tx,event,intent,owner.recipientId);
      const actionability=current.unknown?'ACTIONABILITY_UNCONFIRMED':intent.purpose!=='order-approval'?'CURRENT CONTEXT':s.work?.currentEdition!==intent.source.edition?'SUPERSEDED_CONFIRMED':s.work?.cancelled?'SOURCE CLOSED':current.applicable?'ACTIONABLE_CONFIRMED':'RESOLVED_CONFIRMED';
      return{visibility:'FULL',actionability,route:`${owner.domain==='staff'?'/admin/orders/':'/my-closet/orders/'}${encodeURIComponent(s.order.orderId)}?component=${encodeURIComponent(s.componentId)}`};
    },
  };
  return{'native-transaction':policy};
}
