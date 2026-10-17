import {useState} from 'react';
import Button from '../../components/common/Button';
import {AccountPanel} from '../../components/account/AccountVisuals';
import {saveCustomerProfile} from '../../services/customerProfile';
import {reconcileCustomerOperation} from '../../services/accountApi';
import {readOperationMarker,writeOperationMarker,clearOperationMarker} from '../../services/ownerOperation';
import {usePrincipalFence} from '../../hooks/usePrincipalFence';

const fields=[['fullName','Full Name','name',true],['preferredName','Preferred Name','nickname',false],['phoneNumber','Phone Number','tel',true],['publicDisplayName','Public Review / Dicta Moment Display Name','off',false]];
export default function ProfileDetailsEditor({uid,source,onRefresh}) {
  const marker=`udc:profile-save:${uid}:${source.accountId}:${source.epoch}`;
  const [draft,setDraft]=useState(()=>Object.fromEntries(fields.map(([key])=>[key,source.profile[key]||''])));
  const [version,setVersion]=useState(source.version),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [pending,setPending]=useState(()=>readOperationMarker(marker));
  const [blocked,setBlocked]=useState(false);
  const fence=usePrincipalFence(`profile:${uid}:${source.accountId}:${source.epoch}`,()=>{setBlocked(true);setDraft({});setMessage('Current account access must be checked before editing.');});
  async function save(event) {
    event.preventDefault();if(busy||pending||blocked)return;
    const operationId=crypto.randomUUID(),ticket=fence.begin();setBusy(true);setMessage('Saving changes…');
    try {
      writeOperationMarker(marker,{operationId});
      const result=await saveCustomerProfile({uid},draft,{operationId,expectedVersion:version,expectedEpoch:source.epoch});
      if(!fence.current(ticket))return;
      clearOperationMarker(marker);setVersion(result.version);setMessage('Changes saved.');
    } catch(error) {
      if(!fence.current(ticket))return;
      if(error.code==='auth/outcome-unknown'){setPending({operationId});setMessage('Save outcome unconfirmed. Check the result before saving again.');}
      else {clearOperationMarker(marker);setMessage(error.code==='stale-conflict'?'Your details changed elsewhere. Your entered work remains here; reload current details before saving.':'Your changes were not saved. Check the details and current account access.');if(['stale-conflict','stale-authority'].includes(error.code))setBlocked(true);}
    } finally {if(fence.current(ticket))setBusy(false);}
  }
  async function reconcile() {
    const ticket=fence.begin();setBusy(true);
    try {const result=await reconcileCustomerOperation(pending.operationId);if(!fence.current(ticket))return;
      if(result.state==='committed'){clearOperationMarker(marker);setPending(null);setVersion(result.version);setMessage('Changes saved — confirmed from the account record.');}
      else setMessage('The result is still unconfirmed. No duplicate save was sent.');
    } catch {if(fence.current(ticket))setMessage('The result could not be checked yet. Please try checking again.');}
    finally {if(fence.current(ticket))setBusy(false);}
  }
  return <AccountPanel title="Current Personal Details" description="Changes here never change the details captured for previous orders or payments.">
    {message&&<p role="status">{message}</p>}
    <form onSubmit={save} className="profile-details-form">
      {fields.map(([key,label,autoComplete,required])=><div className="field" key={key}><label htmlFor={`profile-${key}`}>{label}{required?' (required)':' (optional)'}</label><input className="form-control" id={`profile-${key}`} name={key} autoComplete={autoComplete} type={key==='phoneNumber'?'tel':'text'} required={required} disabled={busy||Boolean(pending)||blocked} value={draft[key]||''} onChange={event=>setDraft({...draft,[key]:event.target.value})}/></div>)}
      <p>Your name and contact details stay private. A public display name does not grant permission to reuse your media.</p>
      <p>Profile photo editing is not connected yet. Your existing photo reference is preserved.</p>
      <div className="account-actions"><Button type="submit" isLoading={busy} disabled={Boolean(pending)||blocked}>Save Changes</Button>{pending?<Button type="button" onClick={reconcile} disabled={busy}>Check save result</Button>:<Button type="button" variant="ghost" disabled={busy} onClick={onRefresh}>Reload current details</Button>}</div>
    </form>
  </AccountPanel>;
}
