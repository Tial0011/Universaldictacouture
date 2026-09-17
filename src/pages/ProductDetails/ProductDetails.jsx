import { useParams } from "react-router-dom";
import PageIntro from "../../components/common/PageIntro";

export default function ProductDetails() {
  const { productId } = useParams();

  return (
    <PageIntro
      title="Product details"
      description={
        productId
          ? `Details for this piece (${productId}) will appear here once product data is connected.`
          : "Product details will appear here once product data is connected."
      }
    />
  );
}
