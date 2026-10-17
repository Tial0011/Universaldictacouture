import RecordManager from "../../../components/admin/RecordManager";
import { useStaff } from "../../../context/StaffContext";
import { authorizationRoutes } from "../../../services/staffAuthorization";
import ProductContext from "../Operations/ProductContext";
export default function Products() {
  const { staff } = useStaff();
  return ["products.create", "products.edit", "products.commercial", "products.media", "products.discovery", "products.publish", "products.unpublish", "products.archive", "products.restore"].some(capability => authorizationRoutes(staff, capability, "catalogue").length) ? <RecordManager kind="products" /> : <ProductContext />;
}
