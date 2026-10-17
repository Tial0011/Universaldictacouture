import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { accountRequest } from '../../services/accountApi';
import { auth } from '../../firebase/auth';
import { MESSAGE_LIMIT } from '../../services/chatModel';
import { chatTime, mergeChatMessages, shortChatTime, stageChatPhoto } from '../../services/section10Chat';
import Button from '../common/Button';
import SourceStatus from '../common/SourceStatus';
import ChatIcon from './ChatIcon';
import ProtectedChatImage from './ProtectedChatImage';
import ChatEventSource from './ChatEventSource';
import { usePrincipalFence } from '../../hooks/usePrincipalFence';
import { clearOperationMarker, ownerErrorCopy, ownerErrorState, readOperationMarker, writeOperationMarker } from '../../services/ownerOperation';
import { formatNaira } from '../../utils/formatters';
import './Conversation.css';
import '../../pages/Chats/Chats.css';

function actorName(message, own) {
  if (message.actor?.kind === 'system') return 'Order update';
  if (own) return 'You';
  return message.actorLabel || (message.actor?.kind === 'staff' ? 'Dicta Couturier' : 'Customer');
}

function ContextCard({ source }) {
  if (!source) return null;
  if (!source.available) return <aside className="chat-context chat-context--unavailable" role="status"><ChatIcon name={source.kind === 'review' ? 'review' : 'product'} /><div><p className="chat-context__eyebrow">Reference unavailable</p><strong>{source.kind === 'review' ? 'This Dicta Moment is no longer publicly available.' : 'This piece is no longer publicly available.'}</strong><span>The private conversation remains intact; cached source details are not shown.</span></div></aside>;
  return <aside className="chat-context">
    {source.image?.url ? <img src={source.image.url} alt="" loading="lazy" /> : <ChatIcon name={source.kind === 'review' ? 'review' : 'product'} size={30} />}
    <div><p className="chat-context__eyebrow">{source.kind === 'review' ? 'Public Dicta Moment' : 'Shop reference'}</p><strong>{source.title}</strong><span>{source.summary || (source.variable ? 'Current price depends on the approved selection.' : source.price != null ? formatNaira(source.price) : 'Open the current source to verify details.')}</span></div>
  </aside>;
}

function OrderCard({ context, staff }) {
  const order = context?.order;
  if (!order) return null;
  const target = staff ? `/admin/orders/${encodeURIComponent(order.orderId)}?work=${encodeURIComponent(order.currentWork)}` : `/my-closet/orders/${encodeURIComponent(order.orderId)}?work=${encodeURIComponent(order.currentWork)}`;
  const stage = !order.currentEdition ? 'Edition not established'
    : !order.businessApproved ? 'Business Approval pending'
      : !order.customerApproved ? 'Customer Final Approval pending'
        : !order.paymentEnabled ? 'Payment is not enabled'
          : order.amountDueNowMinor > 0 ? 'Bank Transfer · Amount Due Now'
            : 'Payment completed · Order completion is separate';
  return <article id="chat-current-order" className="chat-order-card" aria-label="Current Main Order context">
    <div className="chat-order-card__top"><span className="chat-order-card__icon"><ChatIcon name="order" /></span><div><span className="chat-order-card__eyebrow">Main Order</span><strong>{order.orderId}</strong></div><span className="chat-order-card__edition">Edition {order.currentEdition || '—'}</span><span className="chat-order-card__state">{order.status}</span></div>
    <div className="chat-order-card__body"><div className="chat-order-card__details"><span className="chat-order-card__order-name">Current Work · {order.currentWork === 'base' ? 'Base' : 'Extension'}</span><strong>{stage}</strong><dl><div><dt>Amount Due Now</dt><dd>{order.amountDueNowMinor == null ? 'Not established' : formatNaira(order.amountDueNowMinor / 100)}</dd></div><div><dt>Verified paid</dt><dd>{formatNaira((order.totalPaidMinor || 0) / 100)}</dd></div><div><dt>Fulfilment</dt><dd>{order.fulfilment}</dd></div><div><dt>Delivery</dt><dd>{order.delivery}</dd></div></dl></div></div>
    <Link className="chat-order-card__cta" to={target}><ChatIcon name="order" size={17} />View current Order Card</Link><p className="chat-order-card__note">Chat text cannot approve an Edition, enable Payment, verify a Bank Transfer or complete this Order.</p>
  </article>;
}

function PrivatePhotos({ attachments, staff, label }) {
  if (!attachments?.length) return null;
  return <div className="chat-media-message"><div className="chat-media-message__grid">{attachments.map((attachment, index) => <ProtectedChatImage key={attachment.referenceId} referenceId={attachment.referenceId} staff={staff} alt={`${label} private chat photo ${index + 1}`} />)}</div></div>;
}

export default function TransactionConversation({ chatId, staff = false, initialDraft = '', initialContext = null, focusEventId = '', embedded = false, onBack, onChanged }) {
  const uid = auth.currentUser?.uid || '', scope = `${uid}:${staff}:${chatId}`, composeId = useId(), searchId = useId();
  const marker = `udc:transaction-send:${scope}`, uploadMarker = `udc:chat-media-stage:${scope}`;
  const [context, setContext] = useState(null), [messages, setMessages] = useState([]), [cursor, setCursor] = useState(null), [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState(() => { try { return sessionStorage.getItem(`udc:chat-draft:${scope}`) || initialDraft; } catch { return initialDraft; } });
  const [replying, setReplying] = useState(null), [editing, setEditing] = useState(null), [sourceDraft, setSourceDraft] = useState(initialContext);
  const [notice, setNotice] = useState({ state: 'checking', text: 'Checking current conversation access…' }), [busy, setBusy] = useState(false), [authorized, setAuthorized] = useState(false), [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(() => readOperationMarker(marker)), [uploadPending, setUploadPending] = useState(() => readOperationMarker(uploadMarker));
  const [staged, setStaged] = useState([]), [menuOpen, setMenuOpen] = useState(false), [panel, setPanel] = useState('');
  const [search, setSearch] = useState(''), [searchResults, setSearchResults] = useState([]), [searchState, setSearchState] = useState('idle');
  const [mediaItems, setMediaItems] = useState([]), [mediaState, setMediaState] = useState('idle');
  const [searchCursor, setSearchCursor] = useState(null), [mediaCursor, setMediaCursor] = useState(null), [searchedTerm, setSearchedTerm] = useState('');
  const [eventSource, setEventSource] = useState(null);
  const [products, setProducts] = useState([]), [productQuery, setProductQuery] = useState(''), [productState, setProductState] = useState('idle');
  const [history, setHistory] = useState([]), [historyCursor, setHistoryCursor] = useState(null), [historyState, setHistoryState] = useState('idle');
  const menu = useRef(null), menuTrigger = useRef(null);
  const messageLog = useRef(null), composer = useRef(null), fileInput = useRef(null), previews = useRef([]), lastMarked = useRef(0), pagingInitialized = useRef(false);
  const loadedMessages = useRef([]), lastMessageRevision = useRef(null);
  useEffect(() => { loadedMessages.current = messages; }, [messages]);
  const fence = usePrincipalFence(scope, () => { setContext(null); setMessages([]); setAuthorized(false); setBusy(false); setNotice({ state: 'restricted', text: 'Checking current access. Private conversation content is unavailable.' }); });

  useEffect(() => {
    try { if (text) sessionStorage.setItem(`udc:chat-draft:${scope}`, text); else sessionStorage.removeItem(`udc:chat-draft:${scope}`); } catch { /* same-session recovery is optional */ }
  }, [scope, text]);

  useEffect(() => () => { for (const url of previews.current) URL.revokeObjectURL(url); }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    menu.current?.querySelector('[role="menuitem"]')?.focus();
    const close = event => {
      if (event.key === 'Escape') { setMenuOpen(false); menuTrigger.current?.focus(); }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && menu.current?.contains(event.target)) {
        event.preventDefault(); const items = [...menu.current.querySelectorAll('[role="menuitem"]')], index = items.indexOf(document.activeElement);
        items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length]?.focus();
      }
      if (event.key === 'Tab') setMenuOpen(false);
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [menuOpen]);

  useEffect(() => {
    if (!authorized || !focusEventId || context?.currentPin?.id === focusEventId) return undefined;
    let live = true; const ticket = fence.begin();
    accountRequest(staff ? 'staff-chat-event' : 'chat-event', { chatId, messageId: focusEventId }, { principalUid: ticket.uid }).then(value => {
      if (!live || !fence.current(ticket)) return;
      setMessages(previous => mergeChatMessages(previous, [value.item]));
      requestAnimationFrame(() => document.getElementById(`chat-message-${value.item.id}`)?.scrollIntoView({ block: 'center' }));
    }).catch(() => { /* The exact event remains unavailable without leaking another scope. */ });
    return () => { live = false; };
  }, [authorized, chatId, context?.currentPin?.id, focusEventId, staff, fence]);

  useEffect(() => {
    let live = true, reading = false;
    const refresh = async () => {
      if (reading) return; reading = true; const ticket = fence.begin();
      try {
        const [detail, page] = await Promise.all([
          accountRequest(staff ? 'staff-conversation' : 'conversation', { chatId }, { principalUid: ticket.uid }),
          accountRequest(staff ? 'staff-messages' : 'messages', { chatId }, { principalUid: ticket.uid }),
        ]);
        if (!live || !fence.current(ticket)) return;
        const ordered = page.items.slice().sort((left, right) => left.sequence - right.sequence);
        const historyChanged = lastMessageRevision.current !== null && lastMessageRevision.current !== detail.messageRevision;
        lastMessageRevision.current = detail.messageRevision;
        let older = historyChanged ? [] : loadedMessages.current.filter(item => item.sequence < (page.cursor || Number.MAX_SAFE_INTEGER));
        // Source references are projections, never permanent permission. Only
        // explicitly loaded references are checked; no unrelated Chat listener.
        older = await Promise.all(older.map(async item => {
          if (!item.sourceContext) return item;
          try { return (await accountRequest(staff ? 'staff-chat-event' : 'chat-event', { chatId, messageId: item.id }, { principalUid: ticket.uid })).item; }
          catch { return { ...item, sourceContext: { kind: item.sourceContext.kind, available: false } }; }
        }));
        if (!live || !fence.current(ticket)) return;
        if (historyChanged) {
          setSearchResults([]); setSearchCursor(null); setMediaItems([]); setMediaCursor(null); setReplying(null);
          setPanel(''); setCursor(page.cursor); setHasMore(page.hasMore);
        }
        setContext(detail); setMessages(mergeChatMessages(older, ordered));
        if (!pagingInitialized.current) { setCursor(page.cursor); setHasMore(page.hasMore); pagingInitialized.current = true; }
        setAuthorized(true); setNotice({ state: detail.sourceUnavailable ? 'partial' : detail.dormant ? 'read-only' : historyChanged ? 'stale' : 'ready', text: detail.sourceUnavailable ? 'Current Order context is temporarily unavailable. Authorized Chat history remains readable; sending is paused until the source is checked.' : detail.dormant ? 'This Chat is dormant and read only. Its history remains available.' : historyChanged ? 'Message history changed elsewhere. Older pages and search results were cleared; load them again to view current authorized content.' : 'Current conversation checked.' });
        const latest = ordered.at(-1)?.sequence || 0;
        if (latest > lastMarked.current) {
          lastMarked.current = latest;
          accountRequest(staff ? 'staff-chat-mark-read' : 'chat-mark-read', { chatId, sequence: latest, operationId: crypto.randomUUID() }, { principalUid: ticket.uid }).then(() => onChanged?.()).catch(() => {});
        }
      } catch (reason) {
        if (live && fence.current(ticket)) { setContext(null); setMessages([]); setAuthorized(false); setNotice({ state: ownerErrorState(reason), text: ownerErrorCopy(reason, 'Current conversation') }); }
      } finally { reading = false; }
    };
    void refresh(); const timer = window.setInterval(refresh, 8000);
    return () => { live = false; window.clearInterval(timer); fence.invalidate(); };
  }, [chatId, staff, scope, revision, fence, onChanged]);

  async function loadOlder() {
    if (!cursor || busy || !hasMore) return;
    const ticket = fence.begin(), beforeHeight = messageLog.current?.scrollHeight || 0; setBusy(true);
    try {
      const page = await accountRequest(staff ? 'staff-messages' : 'messages', { chatId, before: cursor }, { principalUid: ticket.uid });
      if (!fence.current(ticket)) return;
      setMessages(previous => mergeChatMessages(page.items, previous)); setCursor(page.cursor); setHasMore(page.hasMore);
      requestAnimationFrame(() => { if (messageLog.current) messageLog.current.scrollTop += messageLog.current.scrollHeight - beforeHeight; });
    } catch (reason) { if (fence.current(ticket)) setNotice({ state: ownerErrorState(reason), text: ownerErrorCopy(reason, 'Older messages') }); }
    finally { if (fence.current(ticket)) setBusy(false); }
  }

  function clearStaged() {
    for (const item of staged) if (item.preview) { URL.revokeObjectURL(item.preview); previews.current = previews.current.filter(url => url !== item.preview); }
    setStaged([]);
  }

  async function send(event) {
    event.preventDefault();
    if (busy || pending || uploadPending || !authorized || context?.dormant || context?.sourceUnavailable) return;
    if (editing) { await changeMessage('edit', editing, text); return; }
    if (!text.trim() && !staged.length && !sourceDraft) return;
    const ticket = fence.begin(), operationId = crypto.randomUUID(); setBusy(true); setNotice({ state: 'sending', text: 'Sending this message…' });
    try {
      writeOperationMarker(marker, { operationId, phase: 'send' }); setPending({ operationId, phase: 'send' });
      await accountRequest(staff ? 'staff-message-send' : 'message-send', { chatId, body: text, operationId, assetIds: staged.map(item => item.assetId), ...(replying ? { replyToMessageId: replying.id } : {}), ...(sourceDraft ? { sourceContext: sourceDraft } : {}) }, { principalUid: ticket.uid });
      if (!fence.current(ticket)) return;
      clearOperationMarker(marker); setPending(null); setText(''); setReplying(null); setSourceDraft(null); clearStaged(); setNotice({ state: 'saved', text: 'Message saved to this conversation.' }); setRevision(value => value + 1); onChanged?.();
    } catch (reason) {
      if (fence.current(ticket)) { const state = ownerErrorState(reason); setNotice({ state, text: ownerErrorCopy(reason, 'Your message') }); if (state !== 'unknown-result') { clearOperationMarker(marker); setPending(null); } if (state === 'restricted') { setMessages([]); setAuthorized(false); } }
    } finally { if (fence.current(ticket)) setBusy(false); }
  }

  async function changeMessage(action, message, nextBody = '') {
    if (busy || pending || context?.sourceUnavailable || !message || action === 'delete' && !window.confirm('Delete this eligible ordinary message for everyone? A tombstone and protected audit history will remain.')) return;
    const ticket = fence.begin(), operationId = crypto.randomUUID(); setBusy(true); setNotice({ state: 'saving', text: action === 'edit' ? 'Saving this message edit…' : 'Deleting this eligible message…' });
    try {
      writeOperationMarker(marker, { operationId, phase: 'change' }); setPending({ operationId, phase: 'change' });
      await accountRequest(staff ? 'staff-message-change' : 'message-change', { chatId, messageId: message.id, expectedVersion: message.version, action, ...(action === 'edit' ? { body: nextBody } : {}), operationId }, { principalUid: ticket.uid });
      if (!fence.current(ticket)) return;
      clearOperationMarker(marker); setPending(null); if (action === 'edit') { setEditing(null); setText(''); } setReplying(null); setNotice({ state: 'saved', text: action === 'edit' ? 'Message edit saved.' : 'Message deleted. Its audit evidence remains protected.' }); setRevision(value => value + 1); onChanged?.();
    } catch (reason) { if (fence.current(ticket)) { const state = ownerErrorState(reason); setNotice({ state, text: ownerErrorCopy(reason, 'This message action') }); if (state !== 'unknown-result') { clearOperationMarker(marker); setPending(null); } } }
    finally { if (fence.current(ticket)) setBusy(false); }
  }

  async function checkPending() {
    const current = pending || uploadPending; if (!current || busy) return;
    const ticket = fence.begin(); setBusy(true); setNotice({ state: 'checking-result', text: 'Checking the original action outcome…' });
    try {
      const asset = current === uploadPending || current.phase === 'asset';
      const value = await accountRequest(asset ? (staff ? 'staff-media-stage-reconcile' : 'media-stage-reconcile') : 'transaction-operation', { operationId: current.operationId }, { principalUid: ticket.uid });
      if (!fence.current(ticket)) return;
      if (asset && value.state === 'staged') { clearOperationMarker(uploadMarker); setUploadPending(null); setStaged(items => items.some(item => item.assetId === value.assetId) ? items : [...items, { assetId: value.assetId, name: 'Recovered private photo', preview: '' }]); setNotice({ state: 'saved', text: 'Private photo upload confirmed. Review the message before sending.' }); }
      else if (!asset && value.state === 'committed') { clearOperationMarker(marker); setPending(null); setEditing(null); setReplying(null); setText(''); if (current.phase === 'send') { setSourceDraft(null); clearStaged(); } setNotice({ state: 'saved', text: 'The original action is confirmed.' }); setRevision(number => number + 1); onChanged?.(); }
      else setNotice({ state: 'unknown-result', text: 'The outcome is still unconfirmed. The action has not been repeated.' });
    } catch (reason) { if (fence.current(ticket)) setNotice({ state: 'unknown-result', text: ownerErrorCopy(reason, 'The original action outcome') }); }
    finally { if (fence.current(ticket)) setBusy(false); }
  }

  async function selectPhotos(event) {
    const files = [...event.target.files]; event.target.value = '';
    if (!files.length || busy || pending || uploadPending || staged.length + files.length > 4 || !context?.media) return;
    const ticket = fence.begin(); setBusy(true); setNotice({ state: 'saving', text: 'Preparing private photo upload…' });
    try {
      for (const file of files) {
        const operationId = crypto.randomUUID(); writeOperationMarker(uploadMarker, { operationId, phase: 'asset' }); setUploadPending({ operationId, phase: 'asset' });
        const result = await stageChatPhoto({ file, chatId, expectedVersion: context.media.expectedVersion, expectedEpoch: context.media.expectedEpoch, staff, principalUid: ticket.uid, operationId });
        if (!fence.current(ticket)) return;
        const preview = URL.createObjectURL(file); previews.current.push(preview); setStaged(previous => [...previous, { assetId: result.assetId, preview, name: file.name }]); clearOperationMarker(uploadMarker); setUploadPending(null);
      }
      setNotice({ state: 'ready', text: 'Private photo staged. It is not sent until you choose Send.' });
    } catch (reason) { if (fence.current(ticket)) { const state = ownerErrorState(reason); setNotice({ state, text: ownerErrorCopy(reason, 'The private photo upload') }); if (state !== 'unknown-result') { clearOperationMarker(uploadMarker); setUploadPending(null); } } }
    finally { if (fence.current(ticket)) setBusy(false); }
  }

  async function runSearch(event, before = null) {
    event?.preventDefault(); if (!search.trim() || searchState === 'loading') return;
    const term = before ? searchedTerm : search.trim(), ticket = fence.begin(); setSearchState('loading'); if (!before) { setSearchResults([]); setSearchCursor(null); setSearchedTerm(term); }
    try { const value = await accountRequest(staff ? 'staff-chat-search' : 'chat-search', { chatId, term, ...(before ? { before } : {}) }, { principalUid: ticket.uid }); if (fence.current(ticket)) { setSearchResults(previous => before ? [...previous, ...value.items] : value.items); setSearchCursor(value.cursor); setSearchState('ready'); } }
    catch { if (fence.current(ticket)) setSearchState('error'); }
  }

  async function openMedia(before = null) {
    if (typeof before !== 'number') before = null;
    setPanel('media'); setMenuOpen(false); setMediaState('loading'); if (!before) setMediaItems([]); const ticket = fence.begin();
    try { const value = await accountRequest(staff ? 'staff-chat-media' : 'chat-media', { chatId, ...(before ? { before } : {}) }, { principalUid: ticket.uid }); if (fence.current(ticket)) { setMediaItems(previous => before ? [...previous, ...value.items] : value.items); setMediaCursor(value.cursor); setMediaState('ready'); } }
    catch { if (fence.current(ticket)) setMediaState('error'); }
  }

  async function openShop() {
    setPanel('shop'); setProductState('loading'); const ticket = fence.begin();
    try { const value = await accountRequest('catalogue', {}, { publicRequest: true }); if (fence.current(ticket)) { setProducts(value.products || []); setProductState('ready'); } }
    catch { if (fence.current(ticket)) setProductState('error'); }
  }

  async function openHistory(cursor = null) {
    setPanel('history'); setMenuOpen(false); setHistoryState('loading'); const ticket = fence.begin();
    try {
      const value = await accountRequest(staff ? 'staff-conversations' : 'conversations', { relationshipChatId: chatId, ...(cursor ? { cursor } : {}) }, { principalUid: ticket.uid });
      if (fence.current(ticket)) { setHistory(previous => cursor ? [...previous, ...value.records] : value.records); setHistoryCursor(value.cursor); setHistoryState('ready'); }
    } catch { if (fence.current(ticket)) { setHistory([]); setHistoryState('error'); } }
  }

  function focusMessage(message) {
    setMessages(previous => mergeChatMessages(previous, [message])); setPanel(''); requestAnimationFrame(() => document.getElementById(`chat-message-${message.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }

  async function copyMessage(message) {
    try { await navigator.clipboard.writeText(message.body); setNotice({ state: 'saved', text: 'Message text copied.' }); }
    catch { setNotice({ state: 'failed', text: 'Message text could not be copied on this device.' }); }
  }

  const exactFound = !focusEventId || context?.currentPin?.id === focusEventId || messages.some(message => message.id === focusEventId);
  if (!authorized) return <section className={embedded ? 'conversation' : 'chat-window'} aria-label="Conversation access"><div className="conversation__notice"><SourceStatus state={notice.state}>{notice.text}</SourceStatus><Button variant="secondary" disabled={busy} onClick={() => setRevision(value => value + 1)}>Check current conversation</Button>{(pending || uploadPending) && <Button disabled={busy} onClick={checkPending}>Check action outcome</Button>}</div></section>;

  return <section className={`${embedded ? 'chat-window chat-window--embedded' : 'chat-window'}${context?.dormant ? ' is-read-only' : ''}`} aria-label="Current authorized conversation">
    <header className="chat-window__header">{onBack && <button type="button" className="chat-window__back" aria-label="Back to Chats" onClick={onBack}><ChatIcon name="back" /></button>}<span className="chat-avatar" aria-hidden="true">DC</span><div className="chat-window__identity"><div className="chat-window__identity-row"><strong>{context?.couturier || 'Dicta Couturier'}</strong><span className="chat-presence">Availability not promised</span></div><span>{context?.label}{context?.orderNumber ? ` · ${context.orderNumber}` : ''}</span></div><div className="chat-window__title-block"><strong>{context?.title}</strong><span>{context?.dormant ? 'Dormant history' : 'Private website Chat'}</span></div><div className="chat-window__menu-wrap"><button type="button" ref={menuTrigger} className="chat-window__more" aria-label="Chat options" aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}><ChatIcon name="more" /></button>{menuOpen && <div ref={menu} className="chat-menu" role="menu"><button role="menuitem" onClick={() => { setPanel('search'); setMenuOpen(false); }}>Search This Chat</button><button role="menuitem" onClick={() => openHistory()}>Chat History with Couturier</button><button role="menuitem" onClick={openMedia}>Photos &amp; Videos</button>{context?.order && <Link role="menuitem" to={staff ? `/admin/orders/${encodeURIComponent(context.order.orderId)}` : `/my-closet/orders/${encodeURIComponent(context.order.orderId)}`}>View Order Card</Link>}<Link role="menuitem" to={staff ? '/admin/notifications' : '/profile'}>Notification Settings</Link></div>}</div></header>
    {context?.currentPin && <button type="button" className={`current-pin__summary${focusEventId === context.currentPin.id ? ' is-focused' : ''}`} aria-label={`Current Pin: ${context.currentPin.title}`} onClick={() => document.getElementById('chat-current-order')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><ChatIcon name="pin" /><span><small>Current Pin</small><strong>{context.currentPin.title}</strong></span><span className="current-pin__meta">{context.currentPin.state}</span><ChatIcon name="back" className="current-pin__chevron" /></button>}
    <SourceStatus state={notice.state}>{notice.text}</SourceStatus>
    {eventSource && <ChatEventSource key={JSON.stringify(eventSource)} target={eventSource} staff={staff} onClose={() => setEventSource(null)} />}
    {panel === 'attachments' && <aside className="chat-tool-panel" aria-label="Photo sources"><div className="chat-tool-panel__heading"><h2>Add a photo</h2><button type="button" aria-label="Close photo sources" onClick={() => { setPanel(''); composer.current?.focus(); }}><ChatIcon name="close" /></button></div><div className="chat-photo-sources"><Button onClick={openShop}>From Shop</Button><Button onClick={() => { setPanel(''); fileInput.current?.click(); }}>From Device</Button></div></aside>}
    {panel === 'shop' && <aside className="chat-tool-panel" aria-label="Shop photo picker"><div className="chat-tool-panel__heading"><h2>Photo from Shop</h2><button type="button" aria-label="Close Shop photo picker" onClick={() => setPanel('')}><ChatIcon name="close" /></button></div><label>Find a piece<input type="search" value={productQuery} onChange={event => setProductQuery(event.target.value)} /></label>{productState === 'loading' && <p role="status">Loading current Shop photos…</p>}{productState === 'error' && <p role="alert">Shop photos are temporarily unavailable. <button type="button" onClick={openShop}>Try again</button></p>}<div className="chat-shop-photos">{products.filter(product => product.name.toLocaleLowerCase().includes(productQuery.toLocaleLowerCase())).flatMap(product => (product.images || []).map((image, imageIndex) => <button type="button" key={`${product.id}:${imageIndex}`} onClick={() => { setSourceDraft({ kind: 'product', productId: product.id, imageIndex }); setPanel(''); composer.current?.focus(); }}><img src={image.url} alt={image.alt || product.name} loading="lazy" /><span>{product.name}</span></button>))}</div><p>A Shop reference does not create an Order.</p></aside>}
    {panel === 'history' && <aside className="chat-tool-panel" aria-label="Chat History with Couturier"><div className="chat-tool-panel__heading"><h2>Chat History with Couturier</h2><button type="button" aria-label="Close Couturier history" onClick={() => setPanel('')}><ChatIcon name="close" /></button></div>{historyState === 'loading' && <p role="status">Checking authorized conversation history…</p>}{historyState === 'error' && <p role="alert">Conversation history is temporarily unavailable.</p>}<ul>{history.map(row => <li key={row.chatId}><Link to={`${staff ? '/admin/chats' : '/chats'}?chat=${encodeURIComponent(row.chatId)}`}>{row.title} · {row.dormant ? 'Dormant history' : row.label}</Link></li>)}</ul>{historyState === 'ready' && !history.length && <p>No conversations are available in this relationship.</p>}{historyCursor && <Button disabled={historyState === 'loading'} onClick={() => openHistory(historyCursor)}>Load more history</Button>}</aside>}
    {!exactFound && <SourceStatus state="stale">The exact referenced event is unavailable in the current authorized view. Current Chat access remains unchanged.</SourceStatus>}
    {panel === 'search' && <aside className="chat-tool-panel" aria-labelledby={searchId}><div className="chat-tool-panel__heading"><h2 id={searchId}>Search This Chat</h2><button type="button" onClick={() => setPanel('')} aria-label="Close Chat search"><ChatIcon name="close" /></button></div><form onSubmit={runSearch}><label htmlFor={`${searchId}-query`}>Message text</label><div className="chat-tool-panel__search"><input id={`${searchId}-query`} type="search" value={search} maxLength={120} onChange={event => setSearch(event.target.value)} /><Button type="submit" disabled={!search.trim() || searchState === 'loading'}>Search</Button></div></form>{searchState === 'loading' && <p role="status">Searching this authorized Chat…</p>}{searchState === 'error' && <p role="alert">Search is temporarily unavailable.</p>}{searchState === 'ready' && !searchResults.length && <p>No matching messages in the searched pages.</p>}<ul>{searchResults.map(message => <li key={message.id}><button type="button" onClick={() => focusMessage(message)}><strong>{actorName(message, false)}</strong><span>{message.body}</span><small>{chatTime(message.createdAt)}</small></button></li>)}</ul>{searchCursor && <Button disabled={searchState === 'loading'} onClick={() => runSearch(null, searchCursor)}>Search older messages</Button>}</aside>}
    {panel === 'media' && <aside className="chat-tool-panel" aria-label="Photos and videos"><div className="chat-tool-panel__heading"><h2>Photos &amp; Videos</h2><button type="button" onClick={() => setPanel('')} aria-label="Close media history"><ChatIcon name="close" /></button></div>{mediaState === 'loading' && <p role="status">Checking ordinary Chat media…</p>}{mediaState === 'error' && <p role="alert">Media history is temporarily unavailable.</p>}{mediaState === 'ready' && !mediaItems.length && <p>No ordinary Chat photos are available in the loaded pages. Payment Proof and other protected evidence never appear here.</p>}<div className="chat-media-history">{mediaItems.flatMap(message => message.attachments.map((attachment, index) => <button type="button" key={attachment.referenceId} onClick={() => focusMessage(message)}><ProtectedChatImage referenceId={attachment.referenceId} staff={staff} thumbnail alt={`Private Chat photo ${index + 1}`} /><span>{chatTime(message.createdAt)}</span></button>))}</div>{mediaCursor && <Button disabled={mediaState === 'loading'} onClick={() => openMedia(mediaCursor)}>Load older media</Button>}</aside>}
    <div ref={messageLog} className="chat-window__messages" role="log" aria-live="polite" aria-relevant="additions text" tabIndex="0">{hasMore && <div className="chat-load-older"><Button variant="ghost" disabled={busy} onClick={loadOlder}>Load older messages</Button></div>}<div className="chat-day-label"><span>Private conversation</span></div>{context?.order && <OrderCard context={context} staff={staff} />}{!messages.length && <div className="conversation__empty"><h2>No messages yet</h2><p>Start with a question. Entering Chat does not create an Order or Payment.</p></div>}{messages.map(message => {
      const own = message.actor?.kind === context?.viewer?.kind && (staff ? message.actor?.staffId === context?.viewer?.staffId : message.actor?.accountId === context?.viewer?.accountId);
      if (message.kind === 'transaction-event') return <div id={`chat-message-${message.id}`} key={message.id} className={`chat-system-event${focusEventId === message.id ? ' is-focused' : ''}`}><ChatIcon name="timeline" size={15} /><span>{message.body}</span>{message.eventTarget && (message.eventTarget.edition || message.eventTarget.paymentId) && <button type="button" onClick={() => setEventSource(message.eventTarget)}>View source</button>}<time dateTime={Number.isFinite(message.createdAt) ? new Date(message.createdAt).toISOString() : undefined}>{shortChatTime(message.createdAt)}</time></div>;
      return <article id={`chat-message-${message.id}`} key={message.id} className={`chat-message-row${own ? ' is-customer' : ''}${focusEventId === message.id ? ' is-focused' : ''}`} aria-label={`${actorName(message, own)} message`}>
        {!own && <span className="chat-avatar" aria-hidden="true">DC</span>}<div className="chat-message-wrap">{message.sourceContext && <ContextCard source={message.sourceContext} />}{message.replyTo && <blockquote className="chat-reply-reference">{message.replyTo.unavailable ? 'Original message unavailable' : message.replyTo.body}</blockquote>}{message.deleted ? <div className="chat-bubble chat-bubble--deleted"><p>This message was deleted.</p><div className="chat-bubble__meta"><span>Tombstone</span><time dateTime={new Date(message.deletedAt).toISOString()}>{shortChatTime(message.deletedAt)}</time></div></div> : <><div className="chat-bubble">{message.body && <p>{message.body}</p>}<div className="chat-bubble__meta"><span>{actorName(message, own)}</span>{message.editedAt && <span>Edited</span>}<time dateTime={Number.isFinite(message.createdAt) ? new Date(message.createdAt).toISOString() : undefined}>{shortChatTime(message.createdAt)}</time></div></div><PrivatePhotos attachments={message.attachments} staff={staff} label={actorName(message, own)} /><div className="chat-message-actions" aria-label="Message actions"><button type="button" title="Reply" aria-label="Reply to message" onClick={() => { setReplying(message); setEditing(null); composer.current?.focus(); }}><ChatIcon name="reply" size={16} /></button>{message.body && <button type="button" title="Copy" aria-label="Copy message text" onClick={() => copyMessage(message)}><ChatIcon name="copy" size={16} /></button>}{message.canEdit && <button type="button" title="Edit" aria-label="Edit message" onClick={() => { setEditing(message); setReplying(null); setText(message.body); composer.current?.focus(); }}><ChatIcon name="edit" size={16} /></button>}{message.canDelete && <button type="button" title="Delete for everyone" aria-label="Delete message for everyone" onClick={() => changeMessage('delete', message)}><ChatIcon name="trash" size={16} /></button>}</div></>}</div>
      </article>;
    })}</div>
    <form className="chat-composer" onSubmit={send} aria-label="Message composer">{(replying || editing || sourceDraft || staged.length > 0) && <div className="chat-composer__notice"><strong id={composeId}>{editing ? 'Editing your message' : replying ? `Replying to ${actorName(replying, false)}` : sourceDraft ? 'Public-safe source reference ready' : 'Private photo ready'}</strong><button type="button" onClick={() => { setReplying(null); setEditing(null); setSourceDraft(null); if (editing) setText(''); }} aria-label="Cancel current message action"><ChatIcon name="close" size={15} /></button></div>}{staged.length > 0 && <div className="chat-staged-media" aria-label="Staged private photos">{staged.map((item, index) => <div key={item.assetId}>{item.preview ? <img src={item.preview} alt="Private photo preview" /> : <span>Recovered private photo</span>}<button type="button" aria-label={`Remove photo ${index + 1}`} onClick={() => { if (item.preview) URL.revokeObjectURL(item.preview); setStaged(values => values.filter(value => value.assetId !== item.assetId)); }}><ChatIcon name="close" size={14} /></button></div>)}</div>}<div className="chat-composer__bar"><input ref={fileInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={selectPhotos} /><button type="button" className="chat-composer__icon" aria-label="Add private photos" title="Add private photos" disabled={busy || Boolean(pending || uploadPending) || context?.dormant || context?.sourceUnavailable} onClick={() => setPanel('attachments')}><ChatIcon name="image" /></button><span className="chat-composer__media-note" title="Attach a private photo">Photo</span><label className="chat-composer__field" htmlFor={`${composeId}-body`}><span className="visually-hidden">Message</span><textarea ref={composer} id={`${composeId}-body`} value={text} maxLength={MESSAGE_LIMIT} rows="1" onChange={event => setText(event.target.value)} disabled={busy || Boolean(pending || uploadPending) || context?.dormant || context?.sourceUnavailable} placeholder={context?.dormant ? 'This Chat is read only' : 'Write a message'} /></label><button type="submit" className="chat-composer__send" aria-label={editing ? 'Save message edit' : 'Send message'} disabled={busy || Boolean(pending || uploadPending) || context?.dormant || context?.sourceUnavailable || (!text.trim() && !staged.length && !sourceDraft)}><ChatIcon name={editing ? 'check' : 'send'} /></button></div>{(pending || uploadPending) && <Button variant="secondary" disabled={busy} onClick={checkPending}>Check action outcome</Button>}</form>
  </section>;
}
