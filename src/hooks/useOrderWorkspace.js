import { useCallback, useEffect, useRef, useState } from 'react';
import { useStaff } from '../context/StaffContext';
import { auth } from '../firebase/auth';
import { staffFingerprint } from '../services/staffAuthorization';
import { accountRequest } from '../services/accountApi';
import { clearOperationMarker, ownerErrorCopy, ownerErrorState, readOperationMarker, writeOperationMarker } from '../services/ownerOperation';
import { usePrincipalFence } from './usePrincipalFence';
import { targetStillCurrent } from '../services/orderWorkspaceModel';

export function useOrderWorkspace(orderId, componentId) {
  const { staff, uid } = useStaff();
  const scope = `${uid || auth.currentUser?.uid}:${orderId}:${componentId}:${staffFingerprint(staff)}`;
  const marker = `udc:s14:command:${uid || auth.currentUser?.uid}:${orderId}:${componentId}`;
  const [record,setRecord] = useState(null), [state,setState] = useState({ code:'checking',text:'Checking current Main Order…' });
  const [pending,setPending] = useState(() => readOperationMarker(marker)), [busy,setBusy] = useState(false);
  const [refreshEpoch,setRefreshEpoch] = useState(0);
  const current = record?.scope === scope ? record.value : null;
  const readGeneration = useRef(0), lock = useRef(false);
  const fence = usePrincipalFence(scope, () => { readGeneration.current++; setRecord(null);setBusy(false);setState(navigator.onLine===false?{code:'connection-problem',text:'Offline / Connectivity Lost. Private content is unavailable; no protected action has been queued.'}:{code:'restricted',text:'Current access is unconfirmed. Private Order context is unavailable.'}); });
  const refresh = useCallback(async () => {
    const ticket = fence.begin(), generation = ++readGeneration.current;
    try {
      const value = await accountRequest('staff-order-workspace',{orderId,componentId},{principalUid:ticket.uid});
      if (fence.current(ticket) && generation === readGeneration.current) {
        setRecord({scope,value});
        setRefreshEpoch(value=>value+1);
        setState(readOperationMarker(marker)?{code:'unknown-result',text:'Current source checked, but the original action outcome remains unconfirmed. Check it before any new action.'}:value.financialState==='unavailable'?{code:'partial-source-failure',text:'Main Order checked. Financial evidence could not be confirmed; financial progression remains unavailable.'}:{code:'ready',text:'Current source state checked.'});
      }
    } catch (error) {
      if (fence.current(ticket) && generation === readGeneration.current) { setRecord(null);setState({code:ownerErrorState(error),text:ownerErrorCopy(error,'Current Order')}); }
    }
  },[fence,scope,orderId,componentId,marker]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) { setRecord(null);setPending(readOperationMarker(marker));void refresh(); } });
    const interval = setInterval(() => { if (!lock.current) void refresh(); },30000);
    const online = () => { if (!lock.current) void refresh(); };
    window.addEventListener('online',online);
    return () => { active=false;clearInterval(interval);window.removeEventListener('online',online);fence.invalidate(); };
  },[refresh,fence,marker]);
  async function run(endpoint, frozen, payload = frozen) {
    if(navigator.onLine===false){setState({code:'connection-problem',text:'Offline / Connectivity Lost. No protected action was queued or sent.'});return false;}
    if (lock.current || pending || !current || !targetStillCurrent(frozen,current)) {
      setState({code:'stale',text:'Changed Elsewhere. Review the current target before acting.'});return false;
    }
    const ticket = fence.begin(), operationId = crypto.randomUUID();
    lock.current=true;setBusy(true);setState({code:'saving',text:'Checking and committing the exact reviewed target…'});
    try {
      writeOperationMarker(marker,{operationId});
      await accountRequest(endpoint,{...payload,operationId},{principalUid:ticket.uid});
      if (!fence.current(ticket)) return false;
      clearOperationMarker(marker);setPending(null);
      setState({code:'saved',text:'The owner action committed. Checking current source state…'});
      await refresh();return true;
    } catch (error) {
      if (!fence.current(ticket)) return false;
      const code = ownerErrorState(error);
      if (code === 'unknown-result') setPending({operationId});else clearOperationMarker(marker);
      if (code === 'restricted' || code === 'stale') setRecord(null);
      setState({code,text:ownerErrorCopy(error,'This exact Order action')});return false;
    } finally { lock.current=false;if (fence.current(ticket)) setBusy(false); }
  }
  async function check() {
    if (!pending || lock.current) return;
    const ticket=fence.begin();lock.current=true;setBusy(true);setState({code:'checking-result',text:'Checking the original operation. It is not being repeated.'});
    try {
      const result = await accountRequest('transaction-operation',{operationId:pending.operationId},{principalUid:ticket.uid});
      if (!fence.current(ticket)) return;
      if (result.state === 'committed') { clearOperationMarker(marker);setPending(null);await refresh(); }
      else setState({code:'unknown-result',text:'The original outcome is still unknown. No new operation has been sent.'});
    } catch { if (fence.current(ticket)) setState({code:'unknown-result',text:'The original outcome could not be confirmed. Do not repeat this consequence.'}); }
    finally { lock.current=false;if (fence.current(ticket)) setBusy(false); }
  }
  return { current,state,busy,pending,refresh,run,check,scope,fence,refreshEpoch };
}
