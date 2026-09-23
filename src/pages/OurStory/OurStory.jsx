import PageIntro from "../../components/common/PageIntro";
import Button from "../../components/common/Button";
import EditorialSections from "../../components/common/EditorialSections";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";

export default function OurStory() {
  useDocumentMeta({ title: "Our Story | Universal Dicta Couture", description: "More Than Fashion. A Heritage You Wear. Discover the ideas behind Universal Dicta Couture.", canonicalPath: "/our-story" });
  return <>
    <PageIntro title="Our Story" description="More Than Fashion. A Heritage You Wear." />
    <div className="container editorial-content">
      <EditorialSections sections={[
        { title: "The cloth", body: "Aso Oke brings texture, pattern and character to the way we dress. Our collection invites you to explore those details and find your own expression of heritage." },
        { title: "The expression", body: "A celebration, a meaningful occasion, or a look that is simply your own: what you wear can carry both personal style and a connection to something lasting." },
        { title: "The conversation", body: "Your preferences shape the next step. Browse the collection or speak with a Dicta Couturier about the colours, fabrics and silhouettes you have in mind." },
      ]} />
      <div className="editorial-actions"><Button to="/shop">Explore the collection</Button><Button to="/chats" variant="secondary">Contact Dicta Couturier</Button></div>
    </div>
  </>;
}
