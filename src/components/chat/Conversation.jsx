import { useEffect, useRef, useState } from "react";
import Button from "../common/Button";
import { chatError, olderMessages, sendMessage, watchMessages } from "../../services/chats";
import { mergeMessages, MESSAGE_LIMIT } from "../../services/chatModel";
import "./Conversation.css";

function sentAt(timestamp) {
  return timestamp?.toDate?.().toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) || "Sending...";
}

export default function Conversation({ user, customerId, admin = false, title = "Dicta Couturier" }) {
  const [messages, setMessages] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [readError, setReadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [cached, setCached] = useState(false);
  const mounted = useRef(false);
  const sendingRef = useRef(false);
  const bottom = useRef(null);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    let firstServerPage = true;
    let unsubscribe;
    try {
      unsubscribe = watchMessages(customerId, (page, fromCache) => {
        if (!active) return;
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
    } catch (error) { setReadError(chatError(error)); setLoading(false); }
    return () => { active = false; mounted.current = false; unsubscribe?.(); };
  }, [customerId, attempt]);
  const lastMessageId = messages.at(-1)?.id;
  useEffect(() => { bottom.current?.scrollIntoView?.({ block: "nearest" }); }, [lastMessageId]);
  async function loadOlder() {
    setLoadingOlder(true); setActionError("");
    try {
      const page = await olderMessages(customerId, cursor);
      if (!mounted.current) return;
      setMessages(previous => mergeMessages(page.items, previous)); setCursor(page.cursor); setHasMore(page.hasMore);
    } catch (error) { if (mounted.current) setActionError(chatError(error)); }
    finally { if (mounted.current) setLoadingOlder(false); }
  }
  async function submit(event) {
    event.preventDefault();
    if (sendingRef.current || !text.trim()) return;
    sendingRef.current = true; setSending(true); setActionError("");
    try {
      await sendMessage({ user, customerId, text, admin });
      if (mounted.current) setText("");
    } catch (error) { if (mounted.current) setActionError(chatError(error)); }
    finally { sendingRef.current = false; if (mounted.current) setSending(false); }
  }
  return <section className="conversation" aria-label={title + " conversation"}>
    <header className="conversation__header"><h2>{title}</h2><p>{admin ? "Private customer conversation. Replies are sent as Dicta Couturier." : "Private messages between you and the studio."}</p></header>
    {readError ? <div className="conversation__notice"><p role="alert">{readError}</p><Button variant="secondary" onClick={() => { setLoading(true); setReadError(""); setMessages([]); setCursor(null); setHasMore(false); setAttempt(value => value + 1); }}>Try again</Button></div> : <>
      {cached && !loading && <p className="conversation__notice" role="status">Connecting to chat. Messages shown may not be up to date.</p>}
      <div className="conversation__history" role="log" aria-label="Messages" aria-live="polite" aria-busy={loading} tabIndex={0}>
        {hasMore && <Button variant="ghost" onClick={loadOlder} isLoading={loadingOlder}>Load earlier messages</Button>}
        {loading ? <p role="status">Loading messages...</p> : messages.length === 0 ? <p className="conversation__empty">{admin ? "No messages yet." : "Start a conversation about a piece, sizing or a custom style. The studio will reply here."}</p> : messages.map(message => <article key={message.id} className={"conversation__message" + (message.senderRole === (admin ? "admin" : "customer") ? " conversation__message--own" : "")}>
          <strong>{message.senderRole === "admin" ? "Dicta Couturier" : admin ? "Customer" : "You"}</strong>
          <p>{message.body}</p><small>{message.pending ? "Sending..." : sentAt(message.createdAt)}</small>
        </article>)}
        <div ref={bottom} />
      </div>
    </>}
    <form className="conversation__composer" onSubmit={submit}>
      <label htmlFor="chat-message">{admin ? "Reply to customer" : "Your message"}</label>
      <textarea id="chat-message" value={text} onChange={event => setText(event.target.value)} maxLength={MESSAGE_LIMIT} rows={3} required disabled={sending || Boolean(readError) || loading} placeholder="Write your message..." aria-describedby="chat-message-help" />
      <div className="conversation__compose-actions"><small id="chat-message-help">{text.length} / {MESSAGE_LIMIT} characters</small><Button type="submit" isLoading={sending} disabled={!text.trim() || Boolean(readError) || loading}>{sending ? "Sending..." : "Send message"}</Button></div>
      {sending && <p role="status">Waiting for confirmation. Keep this page open until your message is sent.</p>}
      {actionError && <p className="field__error" role="alert">{actionError} Your draft is kept so you can retry.</p>}
    </form>
  </section>;
}
