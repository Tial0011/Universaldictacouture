import { useLocation, useNavigate } from "react-router-dom";
import PageIntro from "../../components/common/PageIntro";
import Button from "../../components/common/Button";
import Conversation from "../../components/chat/Conversation";
import ChatProductTag from "../../components/chat/ChatProductTag";
import { useAuth } from "../../context/AuthContext";
import { isFirebaseConfigured } from "../../firebase/config";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import { MESSAGE_LIMIT, normaliseProductContext } from "../../services/chatModel";
export default function Chats() {
  useDocumentMeta({ title: "Chat with Dicta Couturier | Universal Dicta Couture", noindex: true });
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const draft = typeof location.state?.draft === "string" ? location.state.draft.slice(0, MESSAGE_LIMIT) : "";
  const productContext = normaliseProductContext(location.state?.productContext);
  const returnState = { returnTo: "/chats", draft, productContext };
  return <><PageIntro title="Chat with Dicta Couturier" description="Message the studio about a piece, your measurements or a custom style. Your conversation stays here on the website." />
    <div className="container section"><div className="customer-chat">
      {!isFirebaseConfigured ? <p role="status">Chat is not connected yet. Please try again later.</p> : isLoading ? <p role="status">Checking your account...</p> : user ? <Conversation key={`${user.uid}-${location.key}`} user={user} customerId={user.uid} initialDraft={draft} initialProductContext={productContext} onSent={() => { if (location.state) navigate("/chats", { replace: true, state: null }); }} /> : <section className="surface surface--padded"><h2>Sign in to start a conversation</h2><p>Use your account to send messages and return to the studio's replies.</p><ChatProductTag context={productContext} />{draft && <p>Your enquiry is ready. After signing in, you can review and edit it before sending.</p>}<div className="conversation__compose-actions"><Button to="/signin" state={returnState}>Sign in</Button><Button to="/signup" state={returnState} variant="secondary">Create an account</Button></div></section>}
    </div></div>
  </>;
}
