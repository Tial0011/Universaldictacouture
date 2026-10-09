import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useStaff } from '../../context/StaffContext';
import { staffFingerprint } from '../../services/staffAuthorization';
import { accountRequest } from '../../services/accountApi';
import { usePrincipalFence } from '../../hooks/usePrincipalFence';
import { readOperationMarker, writeOperationMarker, clearOperationMarker, ownerErrorCopy } from '../../services/ownerOperation';
import Button from '../common/Button';
import SourceStatus from '../common/SourceStatus';
import AdminIcon from '../admin/AdminIcon';
import './Notifications.css';

export function useNotifications(domain,filter='all') {
  const {user,sessionState}=useAuth(),staffContext=useStaff();
  const scope=`${user?.uid}:${domain}:${domain==='staff'?staffFingerprint(staffContext?.staff):sessionState}:${filter}`;
  const [source,setSource]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[undo,setUndo]=useState(null),[pending,setPending]=useState(null);
  const fence=usePrincipalFence(scope,()=>{setSource(null);setUndo(null);setBusy(false);});
  const prefix=domain==='staff'?'staff-':'',markerKey=`udc:notification:${user?.uid}:${domain}`;
  const load=useCallback(async(before=null)=>{
    const ticket=fence.begin();setError('');if(!before)setSource(null);
    try{const value=await accountRequest(`${prefix}notifications`,{filter,...(before?{before}:{})});if(fence.current(ticket))setSource(prior=>({scope,...value,records:before&&prior?.scope===scope?[...prior.records,...value.records]:value.records}));}
    catch(failure){if(fence.current(ticket)){setSource(null);setError(ownerErrorCopy(failure,'Notifications'));}}
  },[fence,prefix,filter,scope]);
  useEffect(()=>{
    setPending(readOperationMarker(markerKey));if(!user)return;
    load();const interval=window.setInterval(()=>load(),30000),online=()=>load();window.addEventListener('online',online);
    return()=>{clearInterval(interval);window.removeEventListener('online',online);};
  },[load,markerKey,user]);
  useEffect(()=>{if(!undo)return;const remaining=undo.undoExpiresAt-Date.now();if(remaining<=0){setUndo(null);return;}const timer=setTimeout(()=>setUndo(null),remaining);return()=>clearTimeout(timer);},[undo]);
  async function reconcile() {
    const operation=pending||readOperationMarker(markerKey);if(!operation)return;
    const ticket=fence.begin();setBusy(true);
    try{const result=await accountRequest(`${prefix}notification-operation`,{operationId:operation.operationId});if(!fence.current(ticket))return;if(result.state==='committed'){clearOperationMarker(markerKey);setPending(null);if(result.undoToken&&result.undoExpiresAt>Date.now())setUndo(result);await load();}else setError('The earlier action is still unconfirmed. It has not been repeated.');}
    catch(failure){if(fence.current(ticket))setError(ownerErrorCopy(failure));}finally{if(fence.current(ticket))setBusy(false);}
  }
  async function change(item,action,undoToken) {
    if(pending||busy)return;const ticket=fence.begin(),operationId=crypto.randomUUID();setBusy(true);setError('');
    try{
      writeOperationMarker(markerKey,{operationId});setPending({operationId});
      const result=action==='mark-all'?await accountRequest(`${prefix}notification-mark-all`,{operationId}):await accountRequest(`${prefix}notification-change`,{notificationId:item.notificationId,action,expectedVersion:item.version,operationId,...(undoToken?{undoToken}:{})});
      if(!fence.current(ticket))return;clearOperationMarker(markerKey);setPending(null);setUndo(action==='archive'?result:null);await load();
    }catch(failure){if(fence.current(ticket)){setError(ownerErrorCopy(failure,'This notification action'));if(failure.code!=='auth/outcome-unknown'){clearOperationMarker(markerKey);setPending(null);}}}finally{if(fence.current(ticket))setBusy(false);}
  }
  const visible=source?.scope===scope?source:null;
  return{source:visible,error,busy,pending,undo,load,change,reconcile,prefix,fence};
}
function Item({item,onChange,onOpen,disabled}) {
  const icon=item.taxonomy==='SECURITY'?'shield':item.taxonomy==='TRANSACTION UPDATE'?'credit-card':item.taxonomy==='ACTION REQUIRED'?'file-text':'info';
  return <li className={`notification-item${!item.read?' is-unread':''}`}>
    <span className="notification-item__icon"><AdminIcon name={icon}/></span>
    <div className="notification-item__copy"><span className="notification-taxonomy">{item.taxonomy}</span><h2>{item.heading}</h2><p>{item.body}</p><p className="notification-current">{{ACTIONABLE_CONFIRMED:'Action currently required',RESOLVED_CONFIRMED:'Source action resolved',SUPERSEDED_CONFIRMED:'This earlier request has been superseded', 'SOURCE CLOSED':'The source no longer requires this action','CURRENT CONTEXT':'Open the current source for details','ACCESS LOST':'Access no longer available'}[item.actionability]||'Current status unavailable'}</p><time dateTime={new Date(item.createdAt).toISOString()}>{new Date(item.createdAt).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'})}</time><span className="notification-read-state">{item.read?'Read':'Unread'}</span></div>
    <div className="notification-item__actions">{item.canOpen&&<Button onClick={()=>onOpen(item)} disabled={disabled}>{item.ctaLabel}</Button>}<details className="notification-menu"><summary aria-label="Notification actions">More</summary><div>{!item.read&&<Button variant="ghost" disabled={disabled} onClick={()=>onChange(item,'read')}>Mark read</Button>}<Button variant="ghost" disabled={disabled} onClick={()=>onChange(item,'archive')}>Archive</Button></div></details></div>
  </li>;
}
export function NotificationList({state,latest=false}) {
  const navigate=useNavigate();const [opening,setOpening]=useState(false),[openError,setOpenError]=useState('');
  async function open(item){const ticket=state.fence.begin();setOpening(true);setOpenError('');try{const result=await accountRequest(`${state.prefix}notification-open`,{notificationId:item.notificationId});if(!state.fence.current(ticket))return;if(result.route)navigate(result.route);else setOpenError('The previous action is no longer available.');}catch{if(state.fence.current(ticket))setOpenError('The source could not be opened with current access.');}finally{if(state.fence.current(ticket))setOpening(false);}}
  const records=latest?state.source?.records.slice(0,5):state.source?.records;
  const groups=new Map();
  for(const item of records||[]){const key=item.sourceGroup?.key||item.notificationId;const group=groups.get(key)||{key,label:item.sourceGroup?.label,items:[]};group.items.push(item);groups.set(key,group);}
  const itemNode=item=><Item key={item.notificationId} item={item} onChange={state.change} onOpen={open} disabled={state.busy||opening||Boolean(state.pending)}/>;
  return <>
    {state.error?<SourceStatus state="unavailable">{state.error}</SourceStatus>:!state.source?<SourceStatus state="checking">Checking your notifications. The unread count is not confirmed yet.</SourceStatus>:null}
    {state.source?.state==='PARTIALLY AVAILABLE'&&<SourceStatus state="unavailable">Some history could not be included. The full unread count is unavailable.</SourceStatus>}
    {openError&&<SourceStatus state="unavailable">{openError}</SourceStatus>}
    {state.source?.records.length===0&&<div className="notification-empty"><AdminIcon name="info"/><h2>No notifications in this view</h2><p>This does not mean that your orders, Attention or Chat have no updates.</p></div>}
    {state.source&&<ul className="notification-list">{[...groups.values()].map(group=>group.items.length===1?itemNode(group.items[0]):<li className="notification-group" key={group.key}><details><summary><strong>{group.label}</strong><span>{group.items.length} loaded updates · {group.items.filter(item=>!item.read).length} unread</span><span>{group.items.some(item=>item.actionability==='ACTIONABLE_CONFIRMED')?'A current action requires review':'Communication history'}</span></summary><ul className="notification-list">{group.items.map(itemNode)}</ul></details></li>)}</ul>}
    {state.undo&&<div className="notification-undo" role="status">Notification archived. Undo is available for 10 seconds in this session.<Button variant="secondary" disabled={state.busy} onClick={()=>state.change({notificationId:state.undo.notificationId,version:state.undo.version},'undo',state.undo.undoToken)}>Undo</Button></div>}
    {state.pending&&<SourceStatus state="unknown-result">An earlier action is being checked. It will not be repeated.<Button variant="secondary" onClick={state.reconcile} disabled={state.busy}>Check outcome</Button></SourceStatus>}
    {(state.error||!state.source)&&<Button variant="secondary" onClick={()=>state.load()} disabled={state.busy}>Check notifications</Button>}
    {!latest&&state.source?.next&&<Button variant="secondary" onClick={()=>state.load(state.source.next)} disabled={state.busy}>Load more</Button>}
  </>;
}
export default function NotificationCentre({domain='customer'}) {
  const [filter,setFilter]=useState('all'),state=useNotifications(domain,filter);
  const filters=domain==='staff'?[['all','All'],['unread','Unread'],['security','Security']]:[['all','All'],['unread','Unread'],['action-required','Action Required']];
  return <section className={`notification-centre ${domain==='customer'?'container section':''}`}>
    <header><p className="eyebrow">{domain==='staff'?'Operations':'Your account'}</p><h1>Notifications</h1><p>{domain==='staff'?'Your staff communication and security history.':'Your recent account, order and payment updates.'}</p></header>
    <div className="notification-toolbar"><div className="notification-filters" role="group" aria-label="Notification filters">{filters.map(([value,label])=><Button key={value} variant={value===filter?'primary':'secondary'} aria-label={typeof state.source?.counts?.[value]==='number'?`${label}: ${state.source.counts[value]} notifications`:`${label}. Count unavailable`} aria-pressed={value===filter} disabled={state.busy} onClick={()=>setFilter(value)}><span data-filter-label>{label}</span>{typeof state.source?.counts?.[value]==='number'&&<span aria-hidden="true">({state.source.counts[value]})</span>}</Button>)}</div>
    <Button variant="secondary" onClick={()=>state.change(null,'mark-all')} disabled={!state.source||state.busy||Boolean(state.pending)||state.source.count==null||state.source.count===0}>Mark all read</Button>
    </div>
    <NotificationList state={state}/>
    <p className="notification-history-note">{domain==='staff'?'Staff notifications from the past 180 days are shown here. Related work remains in its owning system.':'Notifications from the past 12 months are shown here. Order and payment history remains in My Closet.'}</p>
  </section>;
}
