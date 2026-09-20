import { Link } from "react-router-dom";
import ProductImage from "../product/ProductImage";
import StitchArrowIcon from "../common/icons/StitchArrowIcon";

/**
 * Homepage promotion for Custom Style — a warm banner with the
 * photograph on the left dissolving into the copy on the right. It
 * introduces the service and sends the visitor to /custom-style; no
 * pricing, turnaround times or guarantees are stated here, because
 * none are specified. `image` is admin-managed (see
 * fetchCustomStylePromo); when there is none yet, ProductImage
 * renders an empty frame rather than a stand-in photo.
 */
export default function CustomStylePromo({ image }) {
  return (
    <section className="custom-promo" aria-labelledby="home-custom-style">
      <div className="custom-promo__inner">
        <div className="custom-promo__media">
          <ProductImage
            image={image}
            alt=""
            transformation="w_800,h_900,c_fill,g_auto,q_auto,f_auto"
            loading="lazy"
          />
        </div>
        <div className="custom-promo__copy">
          <h2 id="home-custom-style">
            Custom Style
            <span className="custom-promo__secondary">Made for You</span>
          </h2>
          <p>
            Bring your ideas to life. Choose your fabrics, share your vision and work with a Dicta
            Couturier on the details.
          </p>
          <Link className="custom-promo__cta" to="/custom-style">
            <span>Start Your Custom Style</span>
            <StitchArrowIcon size={18} className="custom-promo__cta-icon" />
          </Link>
        </div>
      </div>
    </section>
  );
}
