import PageIntro from "../../components/common/PageIntro";
import Button from "../../components/common/Button";
import EditorialSections from "../../components/common/EditorialSections";
import { BRAND } from "../../components/brand/brandLanguage";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";

export default function About() {
  useDocumentMeta({ title: "About | Universal Dicta Couture", description: "Explore Universal Dicta Couture, Aso Oke, personal style and guidance from a Dicta Couturier.", canonicalPath: "/about" });
  return <>
    <PageIntro eyebrow={BRAND.tagline} title="About Universal Dicta Couture" description={BRAND.supportingLine} />
    <div className="container editorial-content">
      <p>{BRAND.declaration}</p>
      <EditorialSections sections={[
        { title: "Find a piece that feels like you", body: "Explore the collection by occasion, style, or fabric and pattern. Take time with each piece, its photographs and its details before choosing what you want to wear." },
        { title: "Make it personal", body: "Have a particular look in mind? Custom Style starts with a conversation about your preferred fabric, style and measurements." },
        { title: "A conversation before a decision", body: "Speak with a Dicta Couturier for personal guidance on a piece or a custom request. Discuss the details that matter to you before proceeding." },
      ]} />
      <div className="editorial-actions"><Button to="/chats">Contact Dicta Couturier</Button><Button to="/shop" variant="secondary">Browse the shop</Button></div>
    </div>
  </>;
}
