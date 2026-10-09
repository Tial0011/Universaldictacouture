import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { accountRequest } from '../../services/accountApi';
import { auth } from '../../firebase/auth';
import { shortChatTime } from '../../services/section10Chat';
import { usePrincipalFence } from '../../hooks/usePrincipalFence';
import { clearOperationMarker, ownerErrorCopy, ownerErrorState, readOperationMarker, writeOperationMarker } from '../../services/ownerOperation';
import Button from '../common/Button';
import SourceStatus from '../common/SourceStatus';
import ConversationList from './ConversationList';
import TransactionConversation from './TransactionConversation';

export default function ChatWorkspace({ staff = false, initialDraft = '', initialContext = null, initialChatId = '' }) {
  const uid = auth.currentUser?.uid || '', scope = `${uid}:${staff}`, marker = `udc:general-chat-start:${scope}`;
  const [params, setParams] = useSearchParams(), selectedId = params.get('chat') || initialChatId || '';
  const [records, setRecords] = useState([]), [search, setSearch] = useState(''), [state, setState] = useState('checking'), [notice, setNotice] = useState('Checking your authorized Chats…');
  const [busy, setBusy] = useState(false), [revision, setRevision] = useState(0), [couturiers, setCouturiers] = useState([]), [chooser, setChooser] = useState(false), [pending, setPending] = useState(() => readOperationMarker(marker));
  const [cursor, setCursor] = useState(null), [loadingMore, setLoadingMore] = useState(false);
  const fence = usePrincipalFence(scope, () => { setRecords([]); setCouturiers([]); setState('restricted'); setNotice('Checking current account access. Private Chat rows are unavailable.'); });
  const changed = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    let live = true; const ticket = fence.begin();
    accountRequest(staff ? 'staff-conversations' : 'conversations', {}, { principalUid: ticket.uid }).then(value => {
      if (!live || !fence.current(ticket)) return;
      setRecords(value.records); setCursor(value.cursor); setState('ready'); setNotice(value.complete ? 'Current authorized Chats checked.' : 'More conversations are available below.');
    }).catch(reason => { if (live && fence.current(ticket)) { setRecords([]); setState(ownerErrorState(reason)); setNotice(ownerErrorCopy(reason, 'Your Chats')); } });
    return () => { live = false; fence.invalidate(); };
  }, [staff, scope, revision, fence]);

  useEffect(() => {
    if (staff) return undefined;
    let live = true; const ticket = fence.begin();
    accountRequest('couturiers', {}, { principalUid: ticket.uid }).then(value => { if (live && fence.current(ticket)) setCouturiers(value.records); }).catch(() => { if (live && fence.current(ticket)) setCouturiers([]); });
    return () => { live = false; };
  }, [staff, scope, fence]);

  const threads = useMemo(() => records.filter(record => `${record.title} ${record.orderNumber || ''} ${record.couturier} ${record.lastMessage}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map(record => ({ id: record.chatId, title: record.title, kind: record.kind === 'transaction' ? 'order' : 'general', label: record.label, orderNumber: record.orderNumber, lastActivity: shortChatTime(record.lastActivity), lastMessage: record.lastMessage, unread: record.unread, unreadComplete: record.unreadComplete })), [records, search]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    const ticket = fence.begin(); setLoadingMore(true);
    try {
      const value = await accountRequest(staff ? 'staff-conversations' : 'conversations', { cursor }, { principalUid: ticket.uid });
      if (!fence.current(ticket)) return;
      setRecords(previous => [...new Map([...previous, ...value.records].map(row => [row.chatId, row])).values()].sort((a, b) => b.lastActivity - a.lastActivity)); setCursor(value.cursor);
    } catch (reason) { if (fence.current(ticket)) { setState(ownerErrorState(reason)); setNotice(ownerErrorCopy(reason, 'More conversations')); } }
    finally { if (fence.current(ticket)) setLoadingMore(false); }
  }

  function select(chatId, eventId = '') {
    setParams(previous => { const next = new URLSearchParams(previous); next.set('chat', chatId); if (eventId) next.set('event', eventId); else next.delete('event'); return next; }); setChooser(false);
  }

  async function startGeneral(couturierStaffId = '') {
    if (busy || pending || staff) return;
    const ticket = fence.begin(), operationId = crypto.randomUUID(); setBusy(true); setState('saving'); setNotice('Confirming one reusable Free Chat…');
    try {
      writeOperationMarker(marker, { operationId, phase: 'start' }); setPending({ operationId, phase: 'start' });
      const result = await accountRequest('general-chat-start', { operationId, ...(couturierStaffId ? { couturierStaffId } : {}) }, { principalUid: ticket.uid });
      if (!fence.current(ticket)) return;
      clearOperationMarker(marker); setPending(null); setBusy(false); select(result.chatId); setRevision(value => value + 1);
    } catch (reason) { if (fence.current(ticket)) { const next = ownerErrorState(reason); setState(next); setNotice(ownerErrorCopy(reason, 'The Free Chat')); if (next !== 'unknown-result') { clearOperationMarker(marker); setPending(null); } setBusy(false); } }
  }

  async function checkStart() {
    if (!pending || busy) return;
    const ticket = fence.begin(); setBusy(true); setState('checking-result'); setNotice('Checking the original Free Chat outcome…');
    try {
      const value = await accountRequest('transaction-operation', { operationId: pending.operationId }, { principalUid: ticket.uid });
      if (!fence.current(ticket)) return;
      if (value.state === 'committed' && value.chatId) { clearOperationMarker(marker); setPending(null); select(value.chatId); setRevision(number => number + 1); }
      else { setState('unknown-result'); setNotice('The Free Chat outcome remains unconfirmed. Creation has not been repeated.'); }
    } catch (reason) { if (fence.current(ticket)) { setState('unknown-result'); setNotice(ownerErrorCopy(reason, 'The Free Chat outcome')); } }
    finally { if (fence.current(ticket)) setBusy(false); }
  }

  return <section className={`${staff ? 'staff-chat-workspace ' : ''}chats-page${selectedId ? ' chats-page--mobile-chat' : ' chats-page--mobile-list'}`} aria-label={staff ? 'Authorized Staff Chats' : 'Your Chats'}>
    <SourceStatus state={state}>{notice}</SourceStatus>
    <div className="chats-shell"><div className="chat-list-wrap"><ConversationList threads={threads} activeId={selectedId} onSelect={select} search={search} onSearchChange={setSearch} />{cursor && <Button variant="ghost" disabled={loadingMore} onClick={loadMore}>Load more conversations</Button>}{!staff && <div className="chat-list__new"><Button disabled={busy || Boolean(pending)} onClick={() => setChooser(open => !open)}>New guidance Chat</Button>{pending && <Button variant="secondary" disabled={busy} onClick={checkStart}>Check creation outcome</Button>}{chooser && <div className="chat-couturier-chooser"><h2>Choose an available Dicta Couturier</h2><p>Availability helps route new guidance. It is not a quality ranking or a guaranteed reply time.</p>{couturiers.length ? couturiers.map(row => <button key={row.staffId} type="button" disabled={busy} onClick={() => startGeneral(row.staffId)}>{row.label}</button>) : <><p>No eligible Couturier list is currently available.</p><button type="button" disabled={busy} onClick={() => startGeneral()}>Open unassigned guidance Chat</button></>}</div>}</div>}</div>
      {selectedId ? <TransactionConversation key={`${scope}:${selectedId}`} chatId={selectedId} staff={staff} initialDraft={initialDraft} initialContext={initialContext} focusEventId={params.get('event') || ''} onBack={() => setParams(previous => { const next = new URLSearchParams(previous); next.delete('chat'); next.delete('event'); return next; })} onChanged={changed} /> : <section className="chat-window chat-window--empty" aria-label="Select a Chat"><div><span className="chat-avatar" aria-hidden="true">DC</span><h2>{records.length ? 'Choose a conversation' : staff ? 'No authorized Chats' : 'Start a private conversation'}</h2><p>{records.length ? 'Select a Free Chat or Main Order Chat. Each relationship keeps its own history.' : staff ? 'No current Chat is discoverable under this Staff authority.' : 'Ask for guidance without creating an Order, approval or Payment.'}</p>{!staff && <Button onClick={() => setChooser(true)}>Choose a Dicta Couturier</Button>}</div></section>}
    </div>
  </section>;
}
