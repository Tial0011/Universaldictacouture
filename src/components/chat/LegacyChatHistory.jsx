import { useEffect, useState } from 'react';
import { auth } from '../../firebase/auth';
import { accountRequest } from '../../services/accountApi';
import { chatTime } from '../../services/section10Chat';
import { usePrincipalFence } from '../../hooks/usePrincipalFence';
import Button from '../common/Button';

export default function LegacyChatHistory() {
  const [items, setItems] = useState([]), [cursor, setCursor] = useState(null), [state, setState] = useState('loading');
  const fence = usePrincipalFence(`${auth.currentUser?.uid}:legacy-history`, () => { setItems([]); setCursor(null); setState('unavailable'); });
  useEffect(() => {
    let live = true; const ticket = fence.begin();
    accountRequest('legacy-chat-history', {}, { principalUid: ticket.uid }).then(value => {
      if (live && fence.current(ticket)) { setItems(value.items); setCursor(value.cursor); setState('ready'); }
    }).catch(() => { if (live && fence.current(ticket)) { setItems([]); setState('unavailable'); } });
    return () => { live = false; fence.invalidate(); };
  }, [fence]);
  async function older() {
    const ticket = fence.begin(); setState('loading');
    try { const value = await accountRequest('legacy-chat-history', { cursor }, { principalUid: ticket.uid }); if (fence.current(ticket)) { setItems(previous => [...value.items, ...previous]); setCursor(value.cursor); setState('ready'); } }
    catch { if (fence.current(ticket)) { setItems([]); setState('unavailable'); } }
  }
  return <section className="conversation" aria-label="Earlier conversation history"><p>Read-only history. Original messages and chronology are preserved.</p>{state === 'loading' && <p role="status">Checking earlier messages…</p>}{state === 'unavailable' && <p role="status">Earlier history is unavailable under your current account access.</p>}{cursor && <Button disabled={state === 'loading'} onClick={older}>Load earlier history</Button>}<div className="conversation__history" role="log" aria-label="Earlier messages">{items.map(item => <article className="conversation__message" key={item.id}><strong>{item.author}</strong><p>{item.body}</p><small>{chatTime(item.createdAt)}</small></article>)}</div>{state === 'ready' && !items.length && <p>No earlier conversation history is available for this account.</p>}</section>;
}
