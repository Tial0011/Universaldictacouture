import { Link } from "react-router-dom";
import ProductImage from "../product/ProductImage";

/**
 * Homepage promotion for Custom Style. It introduces the service and
 * sends the visitor to /custom-style — no pricing, turnaround times or
 * guarantees are stated here, because none are specified. `image` is
 * admin-managed (see fetchCustomStylePromo); when there is none yet,
 * ProductImage renders an empty frame rather than a stand-in photo.
 */
export default function CustomStylePromo({ image }) {
  return (
    <section className="custom-promo" aria-labelledby="home-custom-style">
      <div className="container custom-promo__inner">
        <div className="custom-promo__media">
          <ProductImage
            image={image}
            alt=""
            transformation="w_900,h_1100,c_fill,g_auto,q_auto,f_auto"
            loading="lazy"
          />
        </div>
        <div className="custom-promo__copy">
          <h2 id="home-custom-style">
            Custom Style
            <span className="custom-promo__secondary">Made for You</span>
          </h2>
          <p>
            Have a piece made to your own measurements and fabric choice, guided by the Dicta
            Couturier.
          </p>
          <Link className="btn btn--primary" to="/custom-style">
            Start a Custom Style
          </Link>
        </div>
      </div>
    </section>
  );
}
