import PageIntro from "../components/common/PageIntro";
import Button from "../components/common/Button";

export default function NotFound() {
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
