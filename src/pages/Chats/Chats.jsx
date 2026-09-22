import PageIntro from "../../components/common/PageIntro";
import Button from "../../components/common/Button";
import Conversation from "../../components/chat/Conversation";
import { useAuth } from "../../context/AuthContext";
import { isFirebaseConfigured } from "../../firebase/config";
export default function Chats() {
  const { user, isLoading } = useAuth();
  return <><PageIntro title="Chat with Dicta Couturier" description="Message the studio about a piece, your measurements or a custom style. Your conversation stays here on the website." />
    <div className="container section"><div className="customer-chat">
      {!isFirebaseConfigured ? <p role="status">Chat is not connected yet. Please try again later.</p> : isLoading ? <p role="status">Checking your account...</p> : user ? <Conversation key={user.uid} user={user} customerId={user.uid} /> : <section className="surface surface--padded"><h2>Sign in to start a conversation</h2><p>Use your account to send messages and return to the studio's replies.</p><div className="conversation__compose-actions"><Button to="/signin">Sign in</Button><Button to="/signup" variant="secondary">Create an account</Button></div></section>}
    </div></div>
  </>;
}
