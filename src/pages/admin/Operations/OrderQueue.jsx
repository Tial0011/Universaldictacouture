import { useEffect, useMemo, useRef, useState } from 'react';
import { useStaff } from '../../../context/StaffContext';
import { staffFingerprint } from '../../../services/staffAuthorization';
import { accountRequest } from '../../../services/accountApi';
import { usePrincipalFence } from '../../../hooks/usePrincipalFence';
import { ownerErrorCopy, ownerErrorState } from '../../../services/ownerOperation';
import { workLabel } from '../../../services/orderWorkspaceModel';
import Button from '../../../components/common/Button';
import SourceStatus from '../../../components/common/SourceStatus';
import './OrderOperations.css';

export default function OrderQueue() {
  const { staff,uid }=useStaff();
  const scope=`${uid}:${staffFingerprint(staff)}`;
  const [data,setData]=useState(null), [state,setState]=useState({code:'checking',text:'Checking authorized work…'});
  const [attempt,setAttempt]=useState(0), [search,setSearch]=useState(''), [view,setView]=useState('mine'), [stage,setStage]=useState('all'), [sort,setSort]=useState('reference'), [visible,setVisible]=useState(20);
  const request=useRef(0);
  const fence=usePrincipalFence(scope,()=>{setData(null);setState(navigator.onLine===false?{code:'connection-problem',text:'Offline / Connectivity Lost. Check current access again after reconnecting.'}:{code:'restricted',text:'Work is unavailable until current access is confirmed.'});});
  useEffect(()=>{
    const ticket=fence.begin(),number=++request.current;
    accountRequest('staff-order-queue',{}, {principalUid:ticket.uid}).then(value=>{if(fence.current(ticket)&&request.current===number){setData({scope,value});setState({code:'ready',text:'Current authorized source records checked. This bounded view is not a complete queue.'});}}).catch(error=>{if(fence.current(ticket)&&request.current===number){setData(null);setState({code:ownerErrorState(error),text:ownerErrorCopy(error,'Current work')});}});
    return()=>{fence.invalidate();};
  },[scope,fence,attempt]);
  const source=data?.scope===scope?data.value:null;
  const matches=useMemo(()=> (source?.records||[]).filter(row=>
    (view==='all'||view==='mine'&&row.assignedStaffId===staff?.staffId||view==='unassigned'&&!row.assignedStaffId||view==='claimable'&&row.claimable)
    &&(stage==='all'||stage==='active'&&!row.workCompleted&&!row.workCancelled||row.status===stage)
    && `${row.orderId} ${row.reference||''} ${row.status} ${workLabel(row.currentWork)}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>sort==='stage'?a.status.localeCompare(b.status)||a.orderId.localeCompare(b.orderId):(a.reference||a.orderId).localeCompare(b.reference||b.orderId)),[source,view,staff?.staffId,stage,search,sort]);
  return <div className="admin-stack order-queue"><header className="admin-page-heading"><div><p className="admin-eyebrow">Operations · Current responsibility</p><h1>Orders &amp; Operations</h1><p>Find authorized Main Orders, then open their current work. Queue rows do not authorize an action.</p></div><Button variant="secondary" onClick={()=>{setData(null);setAttempt(v=>v+1);}}>Check current work</Button></header>
    <SourceStatus state={state.code}>{state.text}</SourceStatus>
    <form className="order-tools" onSubmit={event=>event.preventDefault()} role="search" aria-label="Order-local search">
      <label>Find in checked work<input type="search" value={search} maxLength={200} onChange={event=>{setSearch(event.target.value);setVisible(20);}} /></label>
      <label>Responsibility<select value={view} onChange={event=>{setView(event.target.value);setVisible(20);}}><option value="mine">My Work</option><option value="all">Authorized Team Work</option><option value="unassigned">Unassigned</option><option value="claimable">Claimable</option></select></label>
      <label>Source state<select value={stage} onChange={event=>setStage(event.target.value)}><option value="all">All checked states</option><option value="active">All Active</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select></label>
      <label>Sort checked rows<select value={sort} onChange={event=>setSort(event.target.value)}><option value="reference">Main Order reference</option><option value="stage">Source state</option></select></label>
    </form>
    {source&&<><p role="status">{matches.length} matching authorized records in this bounded source view. Missing results do not mean an Order was deleted.</p>
      <ul className="order-queue-list">{matches.slice(0,visible).map(row=><li key={row.orderId} className="admin-panel order-queue-card"><div><p className="admin-eyebrow">Main Order</p><h2>{row.reference||row.orderId}</h2><p>Current Work: {workLabel(row.currentWork)}</p><p>{row.status} · Edition {row.currentEdition||'not established'}</p></div><div><p>{row.fulfilment} · {row.delivery}</p><p>{row.assignedStaffId===staff?.staffId?'Assigned to you':row.assignedStaffId?'Assigned':'Unassigned'}{row.claimable?' · Claim eligible':''}</p></div><Button to={`/admin/orders/${encodeURIComponent(row.orderId)}?work=${encodeURIComponent(row.currentWork)}`} variant="secondary">Open current work</Button></li>)}</ul>
      {!matches.length&&<section className="admin-panel"><h2>No matching checked work</h2><p>Change the filters or check the source again. No inaccessible records are counted.</p></section>}
      {matches.length>visible&&<Button variant="secondary" onClick={()=>setVisible(value=>value+20)}>Show more checked work</Button>}
      <p>Operational priority and complete-queue pagination are not inferred from a status label. Opening a row rechecks current source and access.</p>
    </>}
  </div>;
}
