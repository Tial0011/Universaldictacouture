import { Link } from "react-router-dom";
import Button from "../../components/common/Button";
import "./Home.css";

export default function Home() {
  return (
    <section className="home-hero">
      <div className="container home-hero__inner">
        <p className="home-hero__kicker">Universal Dicta Couture</p>
        <h1 className="home-hero__title">Contemporary fashion, rooted in Aso Oke heritage</h1>
        <p className="home-hero__lede">
          The collection, custom styling, and stories that make up this house
          are being prepared for launch.
        </p>
        <div className="home-hero__actions">
          <Link to="/shop">
            <Button variant="primary">Visit the shop</Button>
          </Link>
          <Link to="/about">
            <Button variant="secondary">About the house</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
