import { useState } from "react";
import { useLocation } from "react-router-dom";
import PageIntro from "../../components/common/PageIntro";
import Button from "../../components/common/Button";
import TransactionConversation from "../../components/chat/TransactionConversation";
import { accountRequest } from "../../services/accountApi";
import ChatProductTag from "../../components/chat/ChatProductTag";
import { useAuth } from "../../context/AuthContext";
import { useAuthGate } from "../../context/AuthGateContext";
import { isFirebaseConfigured } from "../../firebase/config";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import { MESSAGE_LIMIT, normaliseProductContext } from "../../services/chatModel";
import "./Chats.css";
import CustomerAccountBoundary from "../../components/auth/CustomerAccountBoundary";

export default function Chats() {
  useDocumentMeta({ title: "Chat with Dicta Couturier | Universal Dicta Couture", noindex: true });
  const { user, isLoading } = useAuth();
  const { requestAuth } = useAuthGate();
  const location = useLocation();
  const draft = typeof location.state?.draft === "string" ? location.state.draft.slice(0, MESSAGE_LIMIT) : "";
  const productContext = normaliseProductContext(location.state?.productContext);
  const [guestDraft, setGuestDraft] = useState(draft);
  const [chatId,setChatId] = useState(null), [opening,setOpening] = useState(false), [error,setError] = useState("");
  async function openConversation(){if(opening)return;setOpening(true);try{const result=await accountRequest("general-chat-start",{operationId:crypto.randomUUID()});setChatId(result.chatId);}catch{setError("Conversation could not be confirmed. No message has been sent.");}finally{setOpening(false);}}

  function requestSend(event) {
    event.preventDefault();
    const prepared = guestDraft.trim();
    if (!prepared) return;
    requestAuth({ returnTo: "/chats", returnState: { draft: prepared, productContext } });
  }

  return <><PageIntro title="Chat with Dicta Couturier" description="Message the studio about a piece, your measurements or a custom style. Your conversation stays here on the website." />
    <div className="container section"><div className="customer-chat">
      {!isFirebaseConfigured ? <p role="status">Chat is not connected yet. Please try again later.</p>
        : isLoading ? <p role="status">Checking your account...</p>
        : user ? <CustomerAccountBoundary>{chatId ? <TransactionConversation chatId={chatId} initialDraft={draft}/> : <><p>This general conversation is separate from each Order’s transaction Chat.</p>{error&&<p role="status">{error}</p>}<Button disabled={opening} onClick={openConversation}>Open conversation</Button></>}</CustomerAccountBoundary>
        : <section className="surface surface--padded chat-guest-compose"><h2>Prepare your message</h2><p>You can write your enquiry now. Sign in is required only when you press Send, and you’ll return here with the draft ready to review.</p><ChatProductTag context={productContext} /><form onSubmit={requestSend}><div className="field"><label htmlFor="guest-chat-draft">Your message</label><textarea id="guest-chat-draft" value={guestDraft} maxLength={MESSAGE_LIMIT} rows={7} required onChange={(event) => setGuestDraft(event.target.value)} placeholder="Tell the Dicta Couturier what you would like help with." /></div><div className="conversation__compose-actions"><Button type="submit">Send message</Button><Button to="/signin" state={{ returnTo: "/chats", returnState: { draft: guestDraft, productContext } }} variant="secondary">Sign in</Button></div></form></section>}
    </div></div>
  </>;
}
