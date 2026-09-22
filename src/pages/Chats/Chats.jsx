import PageIntro from "../../components/common/PageIntro";
import Button from "../../components/common/Button";
import { SOCIAL_LINKS } from "../../config/socialLinks";
export default function Chats() {
  const contact = SOCIAL_LINKS.find(link => link.id === "whatsapp")?.url;
  return <><PageIntro title="Chat with Dicta Couturier" description="Contact us about a piece, your measurements or a custom style." /><div className="container section">{contact ? <Button href={contact} target="_blank" rel="noopener noreferrer">Continue on WhatsApp</Button> : <p>Chat is currently unavailable. Please try again later.</p>}</div></>;
}
