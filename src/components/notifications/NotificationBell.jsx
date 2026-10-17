import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { NotificationList, useNotifications } from './NotificationCentre';
import Button from '../common/Button';
import AdminIcon from '../admin/AdminIcon';
import { useCustomerSession } from '../../hooks/useCustomerSession';

function CustomerBell() {
  const session=useCustomerSession();
  return session.user?<NotificationBellCore domain="customer"/>:null;
}
export default function NotificationBell({domain='customer'}) {
  const {user}=useAuth();
  if(!user)return null;
  return domain==='customer'?<CustomerBell key={user.uid}/>:<NotificationBellCore key={user.uid} domain="staff"/>;
}
function NotificationBellCore({domain}) {
  const {user}=useAuth(),[opened,setOpened]=useState(false),state=useNotifications(domain),dialog=useRef(null),trigger=useRef(null),id=useId();
  useEffect(()=>{const element=dialog.current;if(!element)return;if(opened&&!element.open)element.showModal();else if(!opened&&element.open)element.close();if(!opened)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous;};},[opened]);
  if(!user)return null;
  const count=state.source?.badge;
  return <>
    <button ref={trigger} type="button" className="notification-bell" aria-label={`Notifications. ${count==null?'Unread count unavailable':count==='0'?'No unread notifications':`${count} unread notifications`}`} aria-haspopup="dialog" aria-expanded={opened} aria-controls={id} onClick={()=>{state.load();setOpened(true);}}><AdminIcon name="bell"/><span className="notification-bell__label">Notifications</span>{count!=null&&count!=='0'&&<span className="notification-badge" aria-hidden="true">{count}</span>}{count==null&&<span className="notification-count-unavailable" aria-hidden="true">Checking</span>}</button>
    <dialog ref={dialog} id={id} className={`notification-drawer notification-drawer--${domain}`} aria-labelledby={`${id}-title`} onCancel={()=>setOpened(false)} onClose={()=>{setOpened(false);trigger.current?.focus();}}><header><h2 id={`${id}-title`}>Notifications</h2><Button variant="ghost" autoFocus onClick={()=>setOpened(false)}>Close</Button></header>{opened&&<NotificationList state={state} latest/>}<Link className="btn btn--secondary" to={domain==='staff'?'/admin/notifications':'/notifications'} onClick={()=>setOpened(false)}>View all notifications</Link></dialog>
  </>;
}
