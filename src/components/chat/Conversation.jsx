import { useEffect, useRef, useState } from "react";
import Button from "../common/Button";
import ChatProductTag from "./ChatProductTag";
import { chatError, hasPendingSend, olderMessages, reconcileMessage, sendMessage, watchMessages } from "../../services/chats";
import { mergeMessages, MESSAGE_LIMIT, normaliseProductContext } from "../../services/chatModel";
import "./Conversation.css";

function sentAt(timestamp) {
  return timestamp?.toDate?.().toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) || "Sending...";
}

export default function Conversation({ user, customerId, admin = false, readOnly = false, title = "Dicta Couturier", initialDraft = "", initialProductContext = null, onSent }) {
  const [messages, setMessages] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [readError, setReadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState(() => initialDraft.slice(0, MESSAGE_LIMIT));
  const [productContext, setProductContext] = useState(() => normaliseProductContext(initialProductContext));
  const [sending, setSending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [checkingSend, setCheckingSend] = useState(true);
  const [cached, setCached] = useState(false);
  const mounted = useRef(false);
  const sendingRef = useRef(false);
  const bottom = useRef(null);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    let firstServerPage = true;
    let unsubscribe;
    hasPendingSend(user.uid, customerId, admin).then(pending => {
      if (active) { setUncertain(pending); if (pending) setActionError("A previous send is awaiting authoritative reconciliation."); }
    }).catch(() => { if (active) setReadError("Current send context could not be verified. No new send is available."); }).finally(() => { if (active) setCheckingSend(false); });
    try {
      unsubscribe = watchMessages(customerId, (page, fromCache) => {
        if (!active) return;
        if (admin && fromCache) { setMessages([]); setCached(true); return; }
        setMessages(previous => mergeMessages(previous.filter(message => !message.pending), page.items));
        setCached(fromCache);
        if (firstServerPage && !fromCache) {
          setCursor(page.cursor); setHasMore(page.hasMore); firstServerPage = false;
        }
        setLoading(false);
      }, error => {
        if (!active) return;
        setReadError(chatError(error)); setMessages([]); setLoading(false); setHasMore(false);
      });
    } catch (error) { queueMicrotask(() => { if (active) { setReadError(chatError(error)); setLoading(false); } }); }
    return () => { active = false; mounted.current = false; unsubscribe?.(); };
  }, [customerId, attempt, admin, user.uid]);
  const lastMessageId = messages.at(-1)?.id;
  useEffect(() => { bottom.current?.scrollIntoView?.({ block: "nearest" }); }, [lastMessageId]);
  async function loadOlder() {
    setLoadingOlder(true); setActionError("");
    try {
      const page = await olderMessages(customerId, cursor, admin);
      if (!mounted.current) return;
      setMessages(previous => mergeMessages(page.items, previous)); setCursor(page.cursor); setHasMore(page.hasMore);
    } catch (error) { if (mounted.current) setActionError(chatError(error)); }
    finally { if (mounted.current) setLoadingOlder(false); }
  }
  async function submit(event) {
    event.preventDefault();
    if (sendingRef.current || checkingSend || uncertain || readOnly || !text.trim()) return;
    sendingRef.current = true; setSending(true); setActionError("");
    try {
      await sendMessage({ user, customerId, text, admin, productContext });
      if (mounted.current) { setText(""); setProductContext(null); onSent?.(); }
    } catch (error) { if (mounted.current) { setActionError(chatError(error)); setUncertain(error.code === "outcome-unknown"); } }
    finally { sendingRef.current = false; if (mounted.current) setSending(false); }
  }
  return <section className="conversation" aria-label={title + " conversation"}>
    <header className="conversation__header"><h2>{title}</h2><p>{admin ? "Private General Chat. Access here does not grant Main Order authority." : "Private messages between you and the studio."}</p></header>
    {readError ? <div className="conversation__notice"><p role="alert">{readError}</p><Button variant="secondary" onClick={() => { setLoading(true); setReadError(""); setMessages([]); setCursor(null); setHasMore(false); setAttempt(value => value + 1); }}>Try again</Button></div> : <>
      {cached && !loading && <p className="conversation__notice" role="status">Connecting to chat. Messages shown may not be up to date.</p>}
      <div className="conversation__history" role="log" aria-label="Messages" aria-live="polite" aria-busy={loading} tabIndex={0}>
        {hasMore && <Button variant="ghost" onClick={loadOlder} isLoading={loadingOlder}>Load earlier messages</Button>}
        {loading ? <p role="status">Loading messages...</p> : messages.length === 0 ? <p className="conversation__empty">{admin ? "No messages yet." : "Start a conversation about a piece, sizing or a custom style. The studio will reply here."}</p> : messages.map(message => <article key={message.id} className={"conversation__message" + (message.senderRole === (admin ? "admin" : "customer") ? " conversation__message--own" : "")}>
          <strong>{message.senderRole === "admin" ? "Dicta Couturier" : admin ? "Customer" : "You"}</strong>
          <ChatProductTag context={message.productContext} />
          <p>{message.body}</p><small>{message.pending ? "Sending..." : sentAt(message.createdAt)}</small>
        </article>)}
        <div ref={bottom} />
      </div>
    </>}
    {readOnly ? <p className="conversation__notice">Read-only context. Reply requires independent current authorization.</p> : <form className="conversation__composer" onSubmit={submit}>
      {productContext && <div className="conversation__attachment"><ChatProductTag context={productContext} /><button type="button" disabled={sending} onClick={() => setProductContext(null)}>Remove product tag</button></div>}
      <label htmlFor="chat-message">{admin ? "Reply to customer" : "Your message"}</label>
      <textarea id="chat-message" value={text} onChange={event => setText(event.target.value)} maxLength={MESSAGE_LIMIT} rows={3} required disabled={sending || Boolean(readError) || loading} placeholder="Write your message..." aria-describedby="chat-message-help" />
      <div className="conversation__compose-actions"><small id="chat-message-help">{text.length} / {MESSAGE_LIMIT} characters</small><Button type="submit" isLoading={sending} disabled={checkingSend || uncertain || !text.trim() || Boolean(readError) || loading}>{sending ? "Sending..." : "Send message"}</Button></div>
      {sending && <p role="status">Waiting for confirmation. Keep this page open until your message is sent.</p>}
      {actionError && <p className="field__error" role="alert">{actionError} The current draft has not been submitted again.</p>}
      {uncertain && <Button variant="secondary" onClick={async () => {
        const state = await reconcileMessage(user.uid, customerId, admin);
        if (!mounted.current) return;
        if (state === "committed") { setText(""); setProductContext(null); setUncertain(false); setActionError(""); onSent?.(); }
        else setActionError("The result remains unresolved. A duplicate message has not been sent.");
      }}>Check send result</Button>}
    </form>}
  </section>;
}
