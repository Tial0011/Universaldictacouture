import { useEffect, useRef, useState } from "react";
import Button from "../../../components/common/Button";
import Conversation from "../../../components/chat/Conversation";
import { useAuth } from "../../../context/AuthContext";
import { chatError, listConversations } from "../../../services/chats";

function Inbox({ user }) {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const active = useRef(false);
  useEffect(() => {
    let current = true;
    active.current = true;
    listConversations().then(page => {
      if (current) { setItems(page.items); setCursor(page.cursor); setHasMore(page.hasMore); }
    }).catch(error => { if (current) setError(chatError(error)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; active.current = false; };
  }, []);
  async function load(more = false) {
    setLoading(true); setError("");
    try {
      const page = await listConversations(more ? cursor : null);
      if (!active.current) return;
      setItems(previous => more ? [...new Map([...previous, ...page.items].map(item => [item.id, item])).values()] : page.items);
      setCursor(page.cursor); setHasMore(page.hasMore);
    } catch (error) { if (active.current) { setError(chatError(error)); if (error.code === "permission-denied") { setItems([]); setSelected(null); } } }
    finally { if (active.current) setLoading(false); }
  }
  return <div className="admin-stack"><header className="admin-page-heading"><div><p className="admin-eyebrow">Customer care</p><h1>Chats</h1><p>Reply to customers here. Open conversations update as messages arrive; refresh the inbox to see new conversations.</p></div></header>
    <div className={"admin-inbox" + (selected ? " admin-inbox--selected" : "")}>
      <aside className="admin-panel admin-inbox__sidebar" aria-label="Customer conversations"><h2>Inbox</h2>
        <div className="admin-inbox__controls"><Button variant="secondary" isLoading={loading} onClick={() => load()}>Refresh inbox</Button></div>
        {error && <p className="field__error" role="alert">{error}</p>}
        {loading && <p role="status">Loading conversations...</p>}
        {!loading && !error && !items.length && <p>No conversations yet. Customer messages will appear here.</p>}
        <ul className="admin-inbox__list">{items.map(item => <li key={item.id}><button className="admin-inbox__item" aria-pressed={selected?.id === item.id} onClick={() => setSelected(item)}><strong>{item.customerName}</strong><small>{item.customerEmail}</small><span className="admin-inbox__preview">{item.lastSenderRole === "admin" ? "Studio: " : "Customer: "}{item.lastMessage}</span><small>{item.updatedAt?.toDate?.().toLocaleString()}</small></button></li>)}</ul>
        {hasMore && <div className="admin-inbox__controls"><Button variant="ghost" disabled={loading} onClick={() => load(true)}>Load more conversations</Button></div>}
      </aside>
      <div>{selected ? <><Button className="admin-inbox__back" variant="ghost" onClick={() => setSelected(null)}>Back to inbox</Button><Conversation key={selected.id} user={user} customerId={selected.id} admin title={selected.customerName || "Customer"} /></> : <section className="admin-panel admin-empty"><h2>Your customer conversations</h2><p>Select a conversation to read messages and reply.</p></section>}</div>
    </div>
  </div>;
}
export default function AdminChats() {
  const { user } = useAuth();
  return user ? <Inbox key={user.uid} user={user} /> : null;
}
