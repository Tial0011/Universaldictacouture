import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Button from "../../../components/common/Button";
import Conversation from "../../../components/chat/Conversation";
import ChatWorkspace from "../../../components/chat/ChatWorkspace";
import { useAuth } from "../../../context/AuthContext";
import { chatError, listConversations, watchConversation } from "../../../services/chats";
import { useStaff } from "../../../context/StaffContext";
import { allows } from "../../../services/staffAuthorization";

function LegacyInbox({ user }) {
  const { staff } = useStaff();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("conversation");
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const active = useRef(false);
  useEffect(() => {
    if (!selectedId) return;
    return watchConversation(selectedId, record => {
      const permitted = record && allows(staff, "chats.read", { purpose: "customer-service", objectId: record.id, assignedStaffId: record.assignedStaffId });
      setSelected(permitted ? record : null);
      if (!permitted) setItems(previous => previous.filter(item => item.id !== selectedId));
    }, () => { setSelected(null); setItems(previous => previous.filter(item => item.id !== selectedId)); setError("Current conversation access could not be verified."); });
  }, [selectedId, staff]);
  useEffect(() => {
    let current = true;
    active.current = true;
    listConversations().then(page => {
      if (current) { setItems(page.items); setCursor(page.cursor); setHasMore(page.hasMore); }
    }).catch(error => { if (current) setError(chatError(error)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; active.current = false; };
  }, []);
  async function load(more = false) {
    setLoading(true); setError(""); if (!more) setItems([]);
    try {
      const page = await listConversations(more ? cursor : null);
      if (!active.current) return;
      setItems(previous => more ? [...new Map([...previous, ...page.items].map(item => [item.id, item])).values()] : page.items);
      setCursor(page.cursor); setHasMore(page.hasMore);
    } catch (error) { if (active.current) { setError(chatError(error)); setItems([]); if (error.code === "permission-denied") setSelected(null); } }
    finally { if (active.current) setLoading(false); }
  }
  return <div className="admin-stack chat-legacy-inbox"><header className="admin-page-heading"><div><p className="admin-eyebrow">Compatibility history</p><h2>Legacy Chat access</h2><p>Existing customer-ID-keyed conversations remain readable through their original guarded service while durable Chats transition forward. This does not create a second messaging product.</p></div></header>
    <div className={"admin-inbox" + (selected ? " admin-inbox--selected" : "")}>
      <aside className="admin-panel admin-inbox__sidebar" aria-label="Customer conversations"><h2>Inbox</h2>
        <div className="admin-inbox__controls"><Button variant="secondary" isLoading={loading} onClick={() => load()}>Refresh inbox</Button></div>
        {error && <p className="field__error" role="alert">{error}</p>}
        {loading && <p role="status">Loading conversations...</p>}
        {!loading && !error && !items.length && <p>No conversations yet. Customer messages will appear here.</p>}
        <ul className="admin-inbox__list">{items.map((item, index) => <li key={item.id}><button className="admin-inbox__item" aria-pressed={selected?.id === item.id} onClick={() => setParams({ conversation: item.id })}><strong>General assistance conversation</strong><small>{item.state}</small><small>{item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "Update time unavailable"}</small><span className="visually-hidden">Open accessible conversation {index + 1}</span></button></li>)}</ul>
        {hasMore && <div className="admin-inbox__controls"><Button variant="ghost" disabled={loading} onClick={() => load(true)}>Load more conversations</Button></div>}
      </aside>
      <div>{selected && selected.id === selectedId ? <><Button className="admin-inbox__back" variant="ghost" onClick={() => setParams({})}>Back to inbox</Button><Conversation key={selected.id} user={user} customerId={selected.id} admin readOnly={!allows(staff, "chats.reply", { purpose: "customer-service", objectId: selected.id, assignedStaffId: selected.assignedStaffId })} title="General assistance" /></> : <section className="admin-panel admin-empty"><h2>Your customer conversations</h2><p>{selectedId ? "Waiting for current authorized conversation context." : "Select a conversation to open current context."}</p></section>}</div>
    </div>
  </div>;
}
export default function AdminChats() {
  const { user } = useAuth();
  return user ? <div className="admin-stack"><ChatWorkspace key={`current:${user.uid}`} staff /><details className="admin-panel chat-legacy-access"><summary>Legacy conversation history</summary><LegacyInbox key={`legacy:${user.uid}`} user={user} /></details></div> : null;
}
