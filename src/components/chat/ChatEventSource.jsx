import { useEffect, useState } from 'react';
import { accountRequest } from '../../services/accountApi';
import { auth } from '../../firebase/auth';
import { usePrincipalFence } from '../../hooks/usePrincipalFence';
import { formatNaira } from '../../utils/formatters';
import Button from '../common/Button';

export default function ChatEventSource({ target, staff, onClose }) {
  const [source, setSource] = useState(null), [state, setState] = useState('loading');
  const scope = `${auth.currentUser?.uid}:${staff}:${target.orderId}:${target.componentId}:${target.edition}:${target.paymentId}`;
  const fence = usePrincipalFence(scope, () => { setSource(null); setState('unavailable'); });
  useEffect(() => {
    let active = true; const ticket = fence.begin();
    const action = target.paymentId ? (staff ? 'staff-payment' : 'payment') : (staff ? 'staff-edition' : 'edition');
    const input = target.paymentId ? { paymentId: target.paymentId } : { orderId: target.orderId, componentId: target.componentId || 'base', number: target.edition };
    accountRequest(action, input, { principalUid: ticket.uid }).then(value => { if (active && fence.current(ticket)) { setSource(value); setState('ready'); } }).catch(() => { if (active && fence.current(ticket)) { setSource(null); setState('unavailable'); } });
    return () => { active = false; fence.invalidate(); };
  }, [scope, target, staff, fence]);
  return <aside className="chat-tool-panel" aria-label="Exact transaction source">
    <div className="chat-tool-panel__heading"><h2>{target.paymentId ? 'Payment Record' : `Edition ${target.edition}`}</h2><Button variant="ghost" onClick={onClose}>Close source</Button></div>
    {state === 'loading' && <p role="status">Checking this exact source and your current access…</p>}
    {state === 'unavailable' && <p role="status">This source is unavailable under your current access.</p>}
    {source && <><p>Read-only source · {target.orderId} · {target.componentId === 'base' ? 'Base' : 'Extension'}</p>{source.edition ? <><p>Viewed Edition {source.viewedEdition} · Current Edition {source.currentEdition}</p><ul>{source.edition.entries?.map(entry => <li key={entry.rootId}>{entry.label} · {entry.quantity} · {formatNaira(entry.unitAmountMinor / 100)}</li>)}</ul></> : <p>{source.paymentState || source.state || source.payment?.state || 'Record checked'} · Payment verification and Order completion are separate.</p>}</>}
  </aside>;
}
