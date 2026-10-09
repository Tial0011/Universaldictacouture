import { useState } from "react";
import { useLocation } from "react-router-dom";
import PageIntro from "../../components/common/PageIntro";
import Button from "../../components/common/Button";
import ChatWorkspace from "../../components/chat/ChatWorkspace";
import LegacyChatHistory from "../../components/chat/LegacyChatHistory";
import ChatProductTag from "../../components/chat/ChatProductTag";
import CustomerAccountBoundary from "../../components/auth/CustomerAccountBoundary";
import { useAuth } from "../../context/AuthContext";
import { useAuthGate } from "../../context/AuthGateContext";
import { isFirebaseConfigured } from "../../firebase/config";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import { MESSAGE_LIMIT, normaliseProductContext } from "../../services/chatModel";
import { chatSourceContext } from "../../services/section10Chat";
import "./Chats.css";

export default function Chats() {
  useDocumentMeta({ title: "Chats | Universal Dicta Couture", noindex: true });
  const { user, isLoading } = useAuth();
  const { requestAuth } = useAuthGate();
  const location = useLocation();
  const draft = typeof location.state?.draft === "string" ? location.state.draft.slice(0, MESSAGE_LIMIT) : "";
  const productContext = normaliseProductContext(location.state?.productContext);
  const sourceContext = chatSourceContext(location.state?.reviewContext || productContext);
  const [guestDraft, setGuestDraft] = useState(draft);
  const [legacyOpen, setLegacyOpen] = useState(false);

  function requestSend(event) {
    event.preventDefault();
    const prepared = guestDraft.trim();
    if (!prepared) return;
    requestAuth({ returnTo: "/chats", returnState: { draft: prepared, productContext, reviewContext: location.state?.reviewContext || null } });
  }

  if (isFirebaseConfigured && !isLoading && user) {
    return <CustomerAccountBoundary><ChatWorkspace initialDraft={draft} initialContext={sourceContext} initialChatId={location.state?.chatId || ""} /><details className="chat-legacy-access" onToggle={event => setLegacyOpen(event.currentTarget.open)}><summary>Earlier conversation history</summary>{legacyOpen && <LegacyChatHistory key={user.uid} />}</details></CustomerAccountBoundary>;
  }

  return <>
    <PageIntro title="Chat with a Dicta Couturier" description="Prepare a private website message. Signing in reveals only Chats authorized for the current account." />
    <div className="container section"><div className="customer-chat">
      {!isFirebaseConfigured ? <p role="status">Chat is not connected yet. Please try again later.</p>
        : isLoading ? <p role="status">Checking your account…</p>
          : <section className="surface surface--padded chat-guest-compose"><h2>Prepare your message</h2><p>You can write your enquiry now. Sign in is required only when you press Send, and you’ll return here with the draft ready to review.</p><ChatProductTag context={productContext} /><form onSubmit={requestSend}><div className="field"><label htmlFor="guest-chat-draft">Your message</label><textarea id="guest-chat-draft" value={guestDraft} maxLength={MESSAGE_LIMIT} rows={7} required onChange={(event) => setGuestDraft(event.target.value)} placeholder="Tell the Dicta Couturier what you would like help with." /></div><div className="conversation__compose-actions"><Button type="submit">Continue to sign in</Button><Button to="/signin" state={{ returnTo: "/chats", returnState: { draft: guestDraft, productContext, reviewContext: location.state?.reviewContext || null } }} variant="secondary">Sign in</Button></div></form></section>}
    </div></div>
  </>;
}
