import { useEffect, useState } from "react";
import { accountRequest } from "../../services/accountApi";
import { auth } from "../../firebase/auth";
import { MESSAGE_LIMIT } from "../../services/chatModel";
import Button from "../common/Button";
import "./Conversation.css";
import { usePrincipalFence } from "../../hooks/usePrincipalFence";
import { ownerErrorCopy, ownerErrorState, readOperationMarker, writeOperationMarker, clearOperationMarker } from "../../services/ownerOperation";
import SourceStatus from "../common/SourceStatus";
export default function TransactionConversation({ chatId, staff = false, initialDraft = "" }) {
  const marker = `udc:transaction-send:${auth.currentUser?.uid}:${chatId}`;
  const scope=`${auth.currentUser?.uid}:${staff}:${chatId}`;
  const [messages, setMessages] = useState([]), [text, setText] = useState(initialDraft), [error, setError] = useState(""), [state,setState] = useState("checking"), [busy, setBusy] = useState(false), [unknown, setUnknown] = useState(() => readOperationMarker(marker)?.operationId || null), [authorized,setAuthorized] = useState(false), [revision,setRevision] = useState(0);
  const fence=usePrincipalFence(scope,()=>{setMessages([]);setAuthorized(false);setText("");setState("restricted");setError("Checking current conversation access. Private messages are unavailable.");});
  useEffect(() => {
    let live = true, reading = false;
    const refresh = async () => {
      if (reading) return; reading = true; const ticket=fence.begin();
      try { const page = await accountRequest(staff ? "staff-messages" : "messages", { chatId }, { principalUid: ticket.uid }); if (live && fence.current(ticket)) { setMessages(page.items.slice().sort((a,b)=>a.sequence-b.sequence)); setAuthorized(true); setState("ready"); if(!unknown)setError(""); } }
      catch(reason) { if (live && fence.current(ticket)) { setMessages([]); setAuthorized(false); setState(ownerErrorState(reason)); setError(ownerErrorCopy(reason,"Current conversation")); } }
      finally { reading = false; }
    };
    void refresh(); const timer = setInterval(refresh, 4000);
    return () => { live = false; clearInterval(timer); fence.invalidate(); };
  }, [chatId, staff, scope, revision, unknown, fence]);
  async function send(event) {
    event.preventDefault(); if (busy || unknown || !authorized || !text.trim()) return;
    const ticket=fence.begin(), operationId = crypto.randomUUID(); setBusy(true); setState("sending"); setError("Sending your message…");
    try { writeOperationMarker(marker,{operationId}); await accountRequest(staff ? "staff-message-send" : "message-send", { chatId, body: text, operationId }, { principalUid: ticket.uid }); if (fence.current(ticket)) { setText(""); clearOperationMarker(marker);setState("saved");setError("Message saved to the conversation.");setRevision(value=>value+1); } }
    catch (reason) { if (fence.current(ticket)) { const resultState=ownerErrorState(reason);setState(resultState);setError(ownerErrorCopy(reason,"Your message"));if(resultState === "unknown-result")setUnknown(operationId);else clearOperationMarker(marker);if(resultState==="restricted"){setMessages([]);setAuthorized(false);setText("");} } }
    finally { if(fence.current(ticket))setBusy(false); }
  }
  async function check() {
    if(busy||!unknown)return;const ticket=fence.begin();setBusy(true);setState("checking-result");setError("Checking the original message outcome…");
    try { const value = await accountRequest("transaction-operation", { operationId: unknown },{principalUid:ticket.uid});if(!fence.current(ticket))return;if(value.state === "committed") { clearOperationMarker(marker); setUnknown(null); setText(""); setError("Message saved to the conversation.");setRevision(value=>value+1); }else{setState("unknown-result");setError("The message is still unconfirmed. It has not been sent again.");} }
    catch(reason) { if(fence.current(ticket)){setState("unknown-result");setError(ownerErrorCopy(reason,"The message outcome"));} }
    finally{if(fence.current(ticket))setBusy(false);}
  }
  if (!authorized) return <section aria-label="Conversation access"><SourceStatus state={state}>{error || "Checking current conversation access…"}</SourceStatus><Button variant="secondary" onClick={()=>{setBusy(false);setRevision(value=>value+1);}}>Check current conversation</Button>{unknown&&<Button disabled={busy} onClick={check}>Check send outcome</Button>}</section>;
  return <section className="conversation" aria-label="Current authorized conversation">
    <p>Messages are communication only. Approvals, Payments and Order actions use their own controls.</p>
    <SourceStatus state={unknown?"unknown-result":state}>{error || (unknown?"A message outcome is unconfirmed. Check it before sending again.":"Current conversation checked.")}</SourceStatus>
    <ol className="conversation__messages">{messages.map(message => <li key={message.id}><strong>{message.actor.kind === "system" ? "System" : message.actor.kind === "staff" ? "Dicta Couturier / Staff" : "Customer"}</strong><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.body}</p><time dateTime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleString()}</time></li>)}</ol>
    <form onSubmit={send}><label htmlFor="transaction-chat-body">Your message</label><textarea id="transaction-chat-body" value={text} maxLength={MESSAGE_LIMIT} rows={5} onChange={event=>setText(event.target.value)} disabled={busy || Boolean(unknown)} required />
      <Button type="submit" disabled={busy || Boolean(unknown)}>{busy ? "Sending…" : "Send message"}</Button>
    </form>{unknown && <Button variant="secondary" disabled={busy} onClick={check}>Check send outcome</Button>}
  </section>;
}
