import PageIntro from "../../components/common/PageIntro";
import Button from "../../components/common/Button";
import { useNavigate } from "react-router-dom";
import EditorialSections from "../../components/common/EditorialSections";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";

export default function CustomStyle() {
  const navigate = useNavigate();
  useDocumentMeta({ title: "Custom Style | Universal Dicta Couture", description: "Share your style, fabric and fit preferences with a Dicta Couturier and start your custom enquiry.", canonicalPath: "/custom-style" });
  function prepareEnquiry(event) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const idea = String(values.get("idea") || "").trim();
    if (!idea) { event.currentTarget.elements.idea.focus(); return; }
    const fabric = String(values.get("fabric") || "").trim();
    const occasion = String(values.get("occasion") || "").trim();
    const draft = ["Hello, I would like to discuss a Custom Style request.", `My idea: ${idea}`, fabric && `Preferred fabric or pattern: ${fabric}`, occasion && `Occasion or preferred date: ${occasion}`].filter(Boolean).join("\n\n");
    navigate("/chats", { state: { draft } });
  }
  return <>
    <PageIntro title="Custom Style" description="Discuss your preferred style, fabric and measurements with Dicta Couturier." />
    <div className="container editorial-content">
      <EditorialSections sections={[
        { title: "01 — Choose a direction", body: "Start with a style, a fabric, an occasion, or an idea you would like to explore." },
        { title: "02 — Share the details", body: "Tell your couturier about your preferred look, measurements and any date or requirements that matter to you." },
        { title: "03 — Confirm together", body: "Discuss the fabric, fit, cost, delivery and timing before deciding how to proceed." },
      ]} />
      <section className="custom-enquiry" aria-labelledby="custom-enquiry-title">
        <h2 id="custom-enquiry-title">Tell us what you have in mind</h2>
        <p>Prepare your enquiry here, then review it in Chats before sending.</p>
        <form onSubmit={prepareEnquiry}>
          <div className="field"><label htmlFor="custom-idea">Your idea</label><textarea id="custom-idea" name="idea" rows={5} required maxLength={1400} placeholder="Describe the style or look you would like to create." /></div>
          <div className="field"><label htmlFor="custom-fabric">Fabric or pattern preference (optional)</label><input id="custom-fabric" name="fabric" maxLength={150} /></div>
          <div className="field"><label htmlFor="custom-occasion">Occasion or preferred date (optional)</label><input id="custom-occasion" name="occasion" maxLength={150} /></div>
          <Button type="submit">Continue with a Couturier</Button>
        </form>
      </section>
      <div className="editorial-actions"><Button to="/chats" variant="secondary">Contact Dicta Couturier</Button><Button to="/shop" variant="ghost">Browse the shop</Button></div>
    </div>
  </>;
}
