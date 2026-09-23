import PageIntro from "../../components/common/PageIntro";
import Button from "../../components/common/Button";
import EditorialSections from "../../components/common/EditorialSections";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";

export default function Policies() {
  useDocumentMeta({ title: "Delivery & order information | Universal Dicta Couture", description: "Bank transfer payments, customer-paid delivery and the details to confirm before ordering.", canonicalPath: "/policies" });
  return <>
    <PageIntro title="Delivery & order information" description="Contact us to confirm delivery costs, timing, sizing and the terms that apply to your order before making payment." />
    <div className="container editorial-content">
      <EditorialSections sections={[
        { title: "Bank transfer only", body: "Payment is by bank transfer. Confirm your selected piece or custom request, the total cost and the payment details with a Dicta Couturier before making a transfer." },
        { title: "Customer-paid delivery", body: "Nationwide and international delivery is customer-paid. Share your destination and confirm the delivery cost and expected timing before proceeding with your order." },
        { title: "Sizing and custom requests", body: "Discuss measurements, fabric, style and any specific requirements before confirming a custom request. Ask about any details you are unsure of before payment." },
        { title: "Confirm your order’s terms", body: "Before paying, ask the couturier to confirm availability, timing and the terms that apply to your order, including changes, cancellations and returns." },
      ]} />
      <section className="editorial-contact" aria-labelledby="contact-details-heading">
        <h2 id="contact-details-heading">Contact Universal Dicta Couture</h2>
        <address>
          <span>Ogun State, Nigeria</span>
          <a href="mailto:universaldictacouture@gmail.com">universaldictacouture@gmail.com</a>
          <a href="tel:+2349061959388">09061959388</a>
        </address>
      </section>
      <div className="editorial-actions"><Button to="/chats">Contact Dicta Couturier</Button><Button to="/shop" variant="secondary">Browse the shop</Button></div>
    </div>
  </>;
}
