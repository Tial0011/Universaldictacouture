import { useCallback, useEffect, useRef, useState } from 'react';
import { useStaff } from '../../../context/StaffContext';
import { accountRequest } from '../../../services/accountApi';
import { allows, staffFingerprint } from '../../../services/staffAuthorization';
import { ownerErrorCopy, ownerErrorState, readOperationMarker, writeOperationMarker, clearOperationMarker } from '../../../services/ownerOperation';
import { usePrincipalFence } from '../../../hooks/usePrincipalFence';
import { signOutUser } from '../../../firebase/auth';
import Button from '../../../components/common/Button';
import SourceStatus from '../../../components/common/SourceStatus';
import Confirmation from '../../../components/admin/Confirmation';
import './Settings.css';

const fields = { bankName: 'Bank name', accountName: 'Account name', accountNumber: 'Account number' };
const requirement = { purpose: 'financial-settings', objectId: 'bank-transfer', governanceArea: 'financial-settings' };
export default function BankSettings() {
  const { staff, uid } = useStaff(), scope = uid + ':' + staffFingerprint(staff), markerKey = 'udc:bank-save:' + uid;
  const [source, setSource] = useState(null), [proposed, setProposed] = useState(null), [history, setHistory] = useState(null);
  const [status, setStatus] = useState('loading'), [message, setMessage] = useState('Checking current Bank access.');
  const [busy, setBusy] = useState(false), [confirmation, setConfirmation] = useState(false), [markerVersion, setMarkerVersion] = useState(0);
  const [freshRequired, setFreshRequired] = useState(false);
  const proposalVersion = useRef(null);
  const lock = useRef(false), pending = readOperationMarker(markerKey);
  const fence = usePrincipalFence(scope, () => { setSource(null); setProposed(null); setHistory(null); setConfirmation(false); setStatus(navigator.onLine === false ? "offline" : "source-unavailable"); setMessage("Current access must be checked again. Protected Bank details are unavailable."); });
  const canRead = allows(staff, 'settings.bank.read', { ...requirement, action: 'read' });
  const canEdit = allows(staff, 'settings.bank.edit', { ...requirement, action: 'edit' });
  const load = useCallback(async () => {
    const ticket = fence.begin();
    try { const result = await accountRequest('staff-configuration', { configurationId: 'bank-transfer' }, { principalUid: uid });
      if (fence.current(ticket)) { setSource({ scope, ...result }); setFreshRequired(false); return true; }
    } catch (error) { if (fence.current(ticket)) { setSource(null); setProposed(null); setHistory(null); setFreshRequired(error.code === 'fresh-auth-required'); throw error; } }
  }, [fence, scope, uid]);
  useEffect(() => {
    let live = true;
    setProposed(null); setHistory(null); setConfirmation(false);
    load().then(loaded => { if (live && loaded) { setStatus('normal'); setMessage('Current Bank version checked. Protected values are masked until you choose to edit.'); } })
      .catch(error => { if (live) { setStatus(ownerErrorState(error)); setMessage(ownerErrorCopy(error, 'Bank settings')); } });
    return () => { live = false; };
  }, [load]);
  const current = source?.scope === scope && canRead ? source : null;
  async function save() {
    if (lock.current || pending || !current || !proposed || !canEdit) return;
    lock.current = true; setBusy(true); setConfirmation(false);
    const ticket = fence.begin(), operationId = crypto.randomUUID();
    try {
      writeOperationMarker(markerKey, { operationId }); setMarkerVersion(markerVersion + 1);
      const result = await accountRequest('staff-configuration-mutate', { configurationId: 'bank-transfer', operationId, action: 'save', expectedVersion: proposalVersion.current, value: proposed }, { principalUid: uid });
      if (!fence.current(ticket)) return;
      clearOperationMarker(markerKey); setMarkerVersion(value => value + 1); setProposed(null);
      setStatus('success'); setMessage(`Bank version ${result.effectiveVersion} confirmed. Future eligible instructions use this version; issued instructions are unchanged.`);
      try { await load(); } catch { if (fence.current(ticket)) { setStatus('partial'); setMessage('The Bank change is confirmed. Current values could not be reloaded; no second Save was sent.'); } }
    } catch (error) { if (fence.current(ticket)) {
      if (error.code !== 'auth/outcome-unknown') { clearOperationMarker(markerKey); setMarkerVersion(value => value + 1); }
      setStatus(error.code === 'auth/outcome-unknown' ? 'unknown-result' : error.code === 'stale-conflict' ? 'conflict' : [401, 403].includes(error.status) ? 'restricted' : 'error');
      setMessage(ownerErrorCopy(error, 'This Bank Save'));
      setFreshRequired(error.code === "fresh-auth-required");
      if ([401, 403].includes(error.status)) { setSource(null); setProposed(null); setHistory(null); }
    } } finally { lock.current = false; if (fence.current(ticket)) setBusy(false); }
  }
  async function check() {
    if (!pending || lock.current) return; lock.current = true; setBusy(true);
    const ticket = fence.begin(); setStatus('checking-result'); setMessage('Checking the authoritative result.');
    try {
      const result = await accountRequest('configuration-operation', { operationId: pending.operationId }, { principalUid: uid });
      if (!fence.current(ticket)) return;
      if (result.state === 'committed') {
        clearOperationMarker(markerKey); setMarkerVersion(value => value + 1); setProposed(null); setStatus('success'); setMessage(`Bank Save confirmed at version ${result.effectiveVersion}. No duplicate Save was sent.`);
        try { await load(); } catch { if (fence.current(ticket)) { setStatus('partial'); setMessage('The earlier Save is confirmed. Current values are temporarily unavailable.'); } }
      } else { setStatus('unknown-result'); setMessage('The result remains unresolved. No duplicate Save is permitted.'); }
    } catch (error) { if (fence.current(ticket)) { if ([401, 403].includes(error.status)) { setSource(null); setProposed(null); setHistory(null); setStatus('restricted'); } else setStatus('unknown-result'); setMessage(ownerErrorCopy(error, 'The earlier Save')); } }
    finally { lock.current = false; if (fence.current(ticket)) setBusy(false); }
  }
  async function loadHistory(before) {
    const ticket = fence.begin(); setBusy(true);
    try { const result = await accountRequest('staff-configuration-history', { configurationId: 'bank-transfer', ...(before ? { before } : {}) }, { principalUid: uid });
      if (fence.current(ticket)) setHistory(prior => ({ scope, ...result, records: before && prior?.scope === scope ? [...prior.records, ...result.records] : result.records }));
    } catch (error) { if (fence.current(ticket)) { if ([401, 403].includes(error.status)) { setSource(null); setProposed(null); setHistory(null); setStatus('restricted'); } else setStatus('partial'); setMessage(ownerErrorCopy(error, 'Bank history')); } }
    finally { if (fence.current(ticket)) setBusy(false); }
  }
  return <section className="admin-stack settings-workspace">
    <header><p className="admin-eyebrow">Settings / Protected</p><h1>Payments &amp; Bank</h1><p>Bank configuration supplies future payment instructions. Section 14 owns each issued instruction and Amount Due Now.</p></header>
    <SourceStatus state={!canRead ? "restricted" : !current && ["normal", "success"].includes(status) ? "loading" : status}>{!canRead ? "Bank-specific access is required." : !current && ["normal", "success"].includes(status) ? "Checking current Bank access." : message}</SourceStatus>
    {!canRead && <SourceStatus state="restricted">Bank-specific access is required.</SourceStatus>}
    {freshRequired && <><p>Sign in again to refresh authentication. This does not grant Bank authority.</p><Button onClick={() => signOutUser()}>Sign out and sign in again</Button></>}
    {pending && <SourceStatus state={busy ? 'checking-result' : 'unknown-result'}>An earlier Save needs confirmation.<Button variant="secondary" disabled={busy} onClick={check}>Check outcome</Button></SourceStatus>}
    {current && <section className="admin-panel admin-stack"><h2>Current configuration</h2><p>Current effective version: {current.effective?.effectiveVersion || 'Not configured'}</p>
      {current.effective && <dl><dt>Bank details</dt><dd>Protected values masked</dd><dt>Account number</dt><dd>••••{current.effective.value.accountNumber.slice(-4)}</dd></dl>}
      <div className="admin-actions"><Button disabled={busy || Boolean(pending) || !canEdit} onClick={() => { proposalVersion.current = current.version; setProposed({ ...(current.effective?.value || { bankName: '', accountName: '', accountNumber: '' }) }); }}>Edit proposed Bank details</Button><Button variant="secondary" disabled={busy} onClick={() => loadHistory()}>Version history</Button><Button variant="ghost" disabled={busy} onClick={() => { setProposed(null); load().catch(error => { setStatus('restricted'); setMessage(ownerErrorCopy(error)); }); }}>Reload current version</Button></div>
    </section>}
    {current && proposed && <form className="admin-panel admin-stack" onSubmit={event => { event.preventDefault(); if (!busy && !pending) setConfirmation(true); }}><h2>Proposed Bank details</h2><p>These values are temporary until Save is confirmed. They are not stored in browser recovery.</p>
      {Object.entries(fields).map(([key, label]) => <label key={key} htmlFor={'bank-' + key}>{label}<input id={'bank-' + key} required maxLength={160} autoComplete="off" value={proposed[key]} disabled={busy || Boolean(pending) || !canEdit} onChange={event => setProposed({ ...proposed, [key]: event.target.value })}/></label>)}
      <div className="admin-actions"><Button type="submit" disabled={busy || Boolean(pending) || !canEdit}>Review protected change</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setProposed(null)}>Discard proposal</Button></div></form>}
    {canRead && history?.scope === scope && <section className="admin-panel admin-stack"><h2>Bank version history</h2><p>History is evidence and cannot restore a configuration.</p><ol>{history.records.map(row => <li key={row.version}>Version {row.version} · {row.state} · {new Date(row.createdAt).toLocaleString('en-NG')}</li>)}</ol>{history.next && <Button variant="secondary" disabled={busy} onClick={() => loadHistory(history.next)}>Load older versions</Button>}</section>}
    {current && confirmation && <Confirmation message="Save one coherent Bank version for future instructions? Protected account values are omitted here. Previously issued instructions keep their original snapshot." disabled={busy} onResult={accepted => { if (accepted) void save(); else setConfirmation(false); }}/>}
    <Button to="/admin/settings" variant="ghost">Back to Settings</Button>
  </section>;
}
