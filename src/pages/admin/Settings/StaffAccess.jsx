import {useEffect,useState} from 'react';
import {useStaff} from '../../../context/StaffContext';
import {accountRequest} from '../../../services/accountApi';
import {OWNER_PROFILE} from '../../../services/superAdminPolicy';
import Button from '../../../components/common/Button';
import Confirmation from '../../../components/admin/Confirmation';
import {signOutUser} from '../../../firebase/auth';

const label=cap=>cap.split('.').map(part=>part.replaceAll('-',' ').replace(/([a-z])([A-Z])/g,'$1 $2')).join(' · ');
function remember(key,value){try{if(value)sessionStorage.setItem(key,value);else sessionStorage.removeItem(key);}catch{/* non-authoritative same-device recovery pointer */}}
export default function StaffAccess(){
  const {staff,uid}=useStaff();const [page,setPage]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[target,setTarget]=useState(null),[pending,setPending]=useState(()=>{try{return sessionStorage.getItem(`udc:staff-access-operation:${uid}`);}catch{return null;}});
  const storageKey=`udc:staff-access-operation:${uid}`;
  async function load(){const value=await accountRequest('staff-access-list',{}, {principalUid:uid});setPage(value);}
  useEffect(()=>{let live=true;if(staff.accessProfile!==OWNER_PROFILE)return;
    accountRequest('staff-access-list',{}, {principalUid:uid}).then(value=>{if(live)setPage(value);}).catch(()=>{if(live)setError('Admin access could not be checked.');});
    return()=>{live=false;};},[uid,staff,storageKey]);
  if(staff.accessProfile!==OWNER_PROFILE)return <section className="admin-panel"><h1>Owner access required</h1><p>Only a website owner can manage admin permissions.</p></section>;
  async function save(){
    if(!target||busy||pending)return;const input={...target.input,operationId:crypto.randomUUID()};setBusy(true);setError('');
    remember(storageKey,input.operationId);
    try{await accountRequest('staff-access-change',input,{principalUid:uid});remember(storageKey,null);setTarget(null);setError('Access change confirmed.');await load().catch(()=>{setPage(null);setError('Access change confirmed. Refresh to check current permissions.');});}
    catch(reason){setTarget(null);if(reason.code==='auth/outcome-unknown'){setPending(input.operationId);setError('The result is unconfirmed. Check the result before another change.');}
      else{remember(storageKey,null);setError(reason.code==='fresh-auth-required'?'Please sign in again before changing admin access.':reason.code==='stale-conflict'?'Access changed elsewhere. Review the current permissions.':'The access change could not be completed.');await load().catch(()=>setPage(null));}}
    finally{setBusy(false);}
  }
  async function reconcile(){setBusy(true);try{const value=await accountRequest('staff-access-operation',{operationId:pending},{principalUid:uid});if(value.state==='committed'){remember(storageKey,null);setPending(null);setError('Change confirmed.');await load();}else setError('The result is still unconfirmed. No duplicate change was sent.');}catch{setError('The result could not be checked yet.');}finally{setBusy(false);}}
  function choose(row,action,enabled,capability){setTarget({name:row.displayName,description:action==='active'?(enabled?'Restore admin access. A fresh sign-in will be required.':'Suspend all admin access immediately.'):action==='all'?(enabled?'Enable all administrative permissions.':'Disable all administrative permissions.'):`${enabled?'Enable':'Disable'} ${label(capability)}.`,input:{uid:row.uid,expectedVersion:row.version,action,enabled,...(capability?{capability}:{})}});}
  return <div className="admin-stack"><header className="admin-page-heading"><div><p className="admin-eyebrow">Website owners</p><h1>Admin permissions</h1><p>Either owner can make these changes independently. Owners remain protected from suspension here.</p></div></header>
    {error&&<p role="status">{error}</p>}{error.includes('sign in again')&&<Button onClick={()=>signOutUser().catch(()=>setError('Please check your connection before signing in again.'))}>Sign out and sign in again</Button>}
    {pending?<Button onClick={reconcile} isLoading={busy}>Check previous result</Button>:<Button onClick={()=>{setError('');load().catch(()=>{setPage(null);setError('Admin access could not be checked.');});}} disabled={busy}>Refresh access</Button>}
    {!page?<p role="status">Checking admin access…</p>:<>{!page.complete&&<p role="status">Showing the first 100 admin records.</p>}{page.records.map(row=><section className="admin-panel admin-stack" key={row.uid}><h2>{row.displayName}</h2><p className="admin-reference">{row.staffId||row.uid}</p><p>{row.role} · {row.active?'Active':'Suspended'}</p>
      {row.email&&<p style={{overflowWrap:'anywhere'}}>{row.email}</p>}{row.owner?<p>Protected website owner</p>:!row.migrated?<p>This existing admin still needs the account repair.</p>:<><div className="admin-actions"><Button disabled={busy||Boolean(pending)} onClick={()=>choose(row,'active',!row.active)}>{row.active?'Suspend admin':'Restore admin'}</Button><Button disabled={busy||Boolean(pending)} onClick={()=>choose(row,'all',true)}>Enable all permissions</Button><Button disabled={busy||Boolean(pending)} onClick={()=>choose(row,'all',false)}>Disable all permissions</Button></div>
      <details><summary>Individual permissions</summary><div className="admin-stack">{page.capabilities.map(cap=><label key={cap} style={{display:'flex',gap:'0.75rem',alignItems:'center',minHeight:44,overflowWrap:'anywhere'}}><input type="checkbox" checked={!row.disabledCapabilities.includes(cap)} disabled={busy||Boolean(pending)} onChange={event=>choose(row,'capability',event.target.checked,cap)}/><span>{label(cap)}</span></label>)}</div></details></>}
    </section>)}</>}
    {target&&<Confirmation message={`${target.name}: ${target.description}`} disabled={busy} onResult={confirmed=>{if(!busy){if(confirmed)void save();else setTarget(null);}}}/>}</div>;
}
