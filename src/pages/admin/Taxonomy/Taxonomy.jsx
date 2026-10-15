import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStaff } from '../../../context/StaffContext';
import { allows, staffFingerprint } from '../../../services/staffAuthorization';
import { accountRequest } from '../../../services/accountApi';
import { ownerErrorCopy, readOperationMarker, writeOperationMarker, clearOperationMarker } from '../../../services/ownerOperation';
import { usePrincipalFence } from '../../../hooks/usePrincipalFence';
import Confirmation from '../../../components/admin/Confirmation';
import SourceStatus from '../../../components/common/SourceStatus';
import Button from '../../../components/common/Button';
import '../Settings/Settings.css';

export default function Taxonomy() {
  const { staff, uid } = useStaff(), scope = uid + ':' + staffFingerprint(staff), markerKey = 'udc:taxonomy-save:' + uid;
  const [source, setSource] = useState(null), [selected, setSelected] = useState(null), [target, setTarget] = useState(null);
  const [notice, setNotice] = useState('Checking current taxonomy access.'), [status, setStatus] = useState('loading'), [busy, setBusy] = useState(false);
  const editorHeading = useRef(null);
  const lock = useRef(false), pending = readOperationMarker(markerKey);
  const fence = usePrincipalFence(scope, () => { setSource(null); setSelected(null); setTarget(null); setStatus(navigator.onLine === false ? "offline" : "source-unavailable"); setNotice("Current access must be checked again before continuing."); });
  const allowed = (action, id) => allows(staff, 'settings.taxonomy.' + action, { purpose: 'taxonomy-settings', objectId: id, action });
  const load = useCallback(async after => {
    const ticket = fence.begin();
    const result = await accountRequest('staff-taxonomy-list', after ? { after } : {}, { principalUid: uid });
    if (!fence.current(ticket)) return false;
    setSource(prior => ({ scope, ...result, records: after && prior?.scope === scope ? [...prior.records, ...result.records] : result.records })); return true;
  }, [fence, scope, uid]);
  useEffect(() => { let live = true; load().then(loaded => { if (live && loaded) { setStatus('normal'); setNotice('Current definitions checked. Product relationships and history remain with their owners.'); } }).catch(error => { if (live) { setStatus('restricted'); setNotice(ownerErrorCopy(error, 'Taxonomy')); } }); return () => { live = false; }; }, [load]);
  async function open(row) {
    if (busy || pending) return; const ticket = fence.begin(); setBusy(true);
    try { const current = await accountRequest('staff-taxonomy', { id: row.id }, { principalUid: uid }); if (fence.current(ticket)) setSelected({ scope, ...current }); }
    catch (error) { if (fence.current(ticket)) { setStatus('restricted'); setNotice(ownerErrorCopy(error)); } } finally { if (fence.current(ticket)) setBusy(false); }
  }
  async function mutate(input) {
    if (lock.current || pending) return; lock.current = true; setBusy(true); setTarget(null);
    const ticket = fence.begin(), operationId = crypto.randomUUID();
    try {
      writeOperationMarker(markerKey, { operationId });
      const result = await accountRequest('staff-taxonomy-change', { operationId, ...input }, { principalUid: uid });
      if (!fence.current(ticket)) return; clearOperationMarker(markerKey); setSelected(null); setStatus('success'); setNotice(`Definition version ${result.version} confirmed. Products were not unpublished or reassigned.`);
      try { await load(); } catch { if (fence.current(ticket)) { setStatus('partial'); setNotice('The taxonomy change is confirmed. The list could not be refreshed.'); } }
    } catch (error) { if (fence.current(ticket)) {
      if (error.code !== 'auth/outcome-unknown') clearOperationMarker(markerKey);
      setStatus(error.code === 'auth/outcome-unknown' ? 'unknown-result' : error.code?.includes('conflict') ? 'conflict' : [401, 403].includes(error.status) ? 'restricted' : 'error');
      setNotice(error.code === 'taxonomy-label-conflict' ? 'An active definition already uses this label in the same family. No duplicate was created.' : ownerErrorCopy(error, 'This taxonomy change'));
      if ([401, 403].includes(error.status)) { setSelected(null); setSource(null); }
    } } finally { lock.current = false; if (fence.current(ticket)) setBusy(false); }
  }
  async function check() {
    if (lock.current || !pending) return; lock.current = true; setBusy(true); const ticket = fence.begin(); setStatus('checking-result'); setNotice('Checking the authoritative result.');
    try { const result = await accountRequest('staff-taxonomy-operation', { operationId: pending.operationId }, { principalUid: uid });
      if (!fence.current(ticket)) return;
      if (result.state === 'committed') { clearOperationMarker(markerKey); setSelected(null); setStatus('success'); setNotice('The earlier change is confirmed. No duplicate request was sent.'); try { await load(); } catch { if (fence.current(ticket)) { setStatus('partial'); setNotice('Change confirmed. The current list is temporarily unavailable.'); } } }
      else { setStatus('unknown-result'); setNotice('The outcome remains unresolved. No repeat change is allowed.'); }
    } catch (error) { if (fence.current(ticket)) { setStatus('unknown-result'); setNotice(ownerErrorCopy(error)); } } finally { lock.current = false; if (fence.current(ticket)) setBusy(false); }
  }
  const current = selected?.scope === scope ? selected : null, records = source?.scope === scope ? source.records : null;
  const mayCreate = records !== null && status !== 'restricted' && allowed('read') && allowed('edit');
  const editorIdentity = current ? current.id || 'new' : null;
  useLayoutEffect(() => { if (editorIdentity && editorHeading.current) { editorHeading.current.focus(); editorHeading.current.scrollIntoView({ block: 'start' }); } }, [editorIdentity]);
  return <section className="admin-stack settings-workspace"><header><p className="admin-eyebrow">Settings</p><h1>Discovery &amp; Taxonomy</h1><p>Occasion, Style and Fabric &amp; Pattern. A rename retains identity; deactivation stops new assignment and preserves existing Products and history.</p></header>
    <SourceStatus state={status}>{notice}</SourceStatus>
    {pending && <SourceStatus state={busy ? 'checking-result' : 'unknown-result'}>An earlier change needs confirmation.<Button variant="secondary" onClick={check} disabled={busy}>Check outcome</Button></SourceStatus>}
    <div className="admin-actions"><Button disabled={!mayCreate || busy || Boolean(pending)} onClick={() => setSelected({ scope, name: '', dimension: 'occasion', order: 0, version: 0, active: true })}>Create definition</Button><Button variant="secondary" disabled={busy} onClick={() => { setSelected(null); load().catch(error => { setStatus('restricted'); setNotice(ownerErrorCopy(error)); }); }}>Reload current definitions</Button></div>
    {records?.length === 0 && <SourceStatus state="empty">No accessible canonical definitions are in this page.</SourceStatus>}
    {!current && <div className="settings-categories">{records?.map(row => <article className="admin-panel admin-stack" key={row.id}><h2>{row.name}</h2><p>{row.dimension === 'fabric' ? 'Fabric & Pattern' : row.dimension} · {row.active ? 'Active' : 'Inactive'} · version {row.version}</p><Button variant="secondary" disabled={busy || Boolean(pending)} onClick={() => open(row)}>Open current definition</Button></article>)}</div>}
    {!current && source?.scope === scope && source.next && <Button disabled={busy} onClick={() => load(source.next).catch(error => { setStatus('partial'); setNotice(ownerErrorCopy(error)); })}>Load more definitions</Button>}
    {current && <form className="admin-panel admin-stack" onSubmit={event => { event.preventDefault(); setTarget({ input: { ...(current.id ? { id: current.id } : {}), expectedVersion: current.version, action: current.id ? 'rename' : 'create', name: current.name, ...(current.id ? {} : { dimension: current.dimension, order: Number(current.order) }) }, message: current.id ? 'Rename this stable definition? Existing Product references and historical labels are retained.' : 'Create this canonical taxonomy definition? This does not assign any Products.' }); }}><h2 tabIndex={-1} ref={editorHeading}>{current.id ? 'Current definition' : 'New definition'}</h2>
      <label htmlFor="taxonomy-name">Label<input id="taxonomy-name" value={current.name} required maxLength={160} disabled={busy || Boolean(pending) || !allowed('edit', current.id)} onChange={event => setSelected({ ...current, name: event.target.value })}/></label>
      {!current.id && <label htmlFor="taxonomy-family">Family<select id="taxonomy-family" value={current.dimension} disabled={busy || Boolean(pending)} onChange={event => setSelected({ ...current, dimension: event.target.value })}><option value="occasion">Occasion</option><option value="style">Style</option><option value="fabric">Fabric &amp; Pattern</option></select></label>}
      <label htmlFor="taxonomy-order">Display order<input id="taxonomy-order" type="number" required step={1} min={0} max={100000} value={current.order} disabled={busy || Boolean(pending) || !allowed('edit', current.id)} onChange={event => setSelected({ ...current, order: event.target.value })}/></label>
      <div className="admin-actions"><Button type="submit" disabled={busy || Boolean(pending) || !allowed('edit', current.id)}>{current.id ? 'Review rename' : 'Review new definition'}</Button>
      {current.id && <Button type="button" variant="secondary" disabled={busy || Boolean(pending) || !allowed('edit', current.id)} onClick={() => setTarget({ input: { id: current.id, expectedVersion: current.version, action: 'reorder', order: Number(current.order) }, message: 'Change presentation order only? Product assignments and publication remain unchanged.' })}>Review reorder</Button>}
      {current.id && <Button type="button" variant="secondary" disabled={busy || Boolean(pending) || !allowed('edit', current.id)} onClick={() => setTarget({ input: { id: current.id, expectedVersion: current.version, action: current.active ? 'deactivate' : 'reactivate' }, message: current.active ? 'Deactivate this definition? New assignment will stop. Product relationships and publication remain unchanged; exact usage totals are not shown here.' : 'Reactivate this same stable definition? This does not restore changed Product assignments.' })}>{current.active ? 'Deactivate' : 'Reactivate'}</Button>}
      <Button type="button" variant="ghost" disabled={busy} onClick={() => setSelected(null)}>Discard proposal</Button></div></form>}
    {current && target && <Confirmation message={target.message} disabled={busy} onResult={accepted => { if (accepted) void mutate(target.input); else setTarget(null); }}/>}
    <Button to="/admin/settings" variant="ghost">Back to Settings</Button></section>;
}
