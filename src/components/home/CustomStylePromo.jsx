import { Link } from "react-router-dom";

/**
 * Homepage promotion for Custom Style. It introduces the service and
 * sends the visitor to /custom-style — no pricing, turnaround times or
 * guarantees are stated here, because none are specified.
 */
export default function CustomStylePromo() {
  return (
    <section className="custom-promo" aria-labelledby="home-custom-style">
      <div className="container custom-promo__inner">
        <h2 id="home-custom-style">Custom Style</h2>
        <span className="accent-rule" aria-hidden="true" />
        <p>
          Have a piece made to your own measurements and fabric choice, guided by the Dicta
          Couturier.
        </p>
        <Link className="btn btn--primary" to="/custom-style">
          Start a Custom Style
        </Link>
      </div>
    </section>
  );
}
