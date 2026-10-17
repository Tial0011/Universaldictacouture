import PageIntro from "../components/common/PageIntro";
import Button from "../components/common/Button";
import { useDocumentMeta } from "../hooks/useDocumentMeta";

export default function NotFound() {
  useDocumentMeta({ title: "Page not found | Universal Dicta Couture", noindex: true });
  return (
    <>
      <PageIntro
        title="Page not found"
        description="The page you're looking for doesn't exist or may have moved."
      />
      <div className="container page-actions">
        <Button to="/" variant="secondary">
          Back to home
        </Button>
      </div>
    </>
  );
}
