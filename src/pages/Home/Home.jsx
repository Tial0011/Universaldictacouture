import { useEffect, useMemo, useState } from "react";
import HeroCarousel from "../../components/home/HeroCarousel";
import TrustStrip from "../../components/home/TrustStrip";
import DiscoveryModule from "../../components/discovery/DiscoveryModule";
import NewIn from "../../components/home/NewIn";
import CustomStylePromo from "../../components/home/CustomStylePromo";
import ReviewsPreview from "../../components/home/ReviewsPreview";
import StyleCircle from "../../components/home/StyleCircle";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import { useCatalogue } from "../../hooks/useCatalogue";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import heroReadyToWear from "../../assets/images/hero/hero-ready-to-wear.jpg";
import {
  APPROVED_HERO_COPY,
  buildShopDiscovery,
  fetchCustomStylePromo,
  fetchHeroSlides,
  fetchPublishedReviews,
} from "../../services/content";
import { DEFAULT_SHOP_BY_GROUPS, fetchShopByGroups } from "../../services/shopBy";
import { selectNewIn } from "../../services/products";
import "./Home.css";
import "../../components/home/home-sections.css";

const FALLBACK_SLIDE = [
  {
    id: "approved-primary",
    concept: "ready-to-wear",
    ...APPROVED_HERO_COPY,
    image: { url: heroReadyToWear, publicId: "", alt: "" },
    order: 0,
  },
];

export default function Home() {
  const { products, isLoading, error } = useCatalogue();
  const [slides, setSlides] = useState(FALLBACK_SLIDE);
  const [shopByGroups, setShopByGroups] = useState(DEFAULT_SHOP_BY_GROUPS);
  const [reviews, setReviews] = useState([]);
  const [customStyleImage, setCustomStyleImage] = useState({
    url: heroReadyToWear,
    publicId: "",
    alt: "",
  });
  const [isHeroReady, setIsHeroReady] = useState(false);

  useDocumentMeta({
    title: "Universal Dicta Couture — Aso Oke for every occasion",
    description:
      "Beautifully crafted Aso Oke for every occasion. Classic, elegant and proudly Nigerian.",
    canonicalPath: "/",
  });

  useEffect(() => {
    let active = true;

    fetchHeroSlides()
      .then((result) => {
        if (active && result.length) setSlides(result);
      })
      .finally(() => {
        if (active) setIsHeroReady(true);
      });

    fetchShopByGroups().then((groups) => {
      if (active && groups.length) setShopByGroups(groups);
    });

    fetchPublishedReviews(3).then((entries) => {
      if (active) setReviews(entries);
    });

    fetchCustomStylePromo().then((result) => {
      if (active && result.image) setCustomStyleImage(result.image);
    });

    return () => {
      active = false;
    };
  }, []);

  const shopByModule = useMemo(
    () => buildShopDiscovery(products, "Shop By", shopByGroups),
    [products, shopByGroups]
  );
  const realNewIn = selectNewIn(products, 6);
  const newInProducts = realNewIn;
  // "View all" goes to the New In filter only when pieces are actually
  // flagged New In; otherwise the section is showing the newest pieces
  // and the whole collection is the honest destination.
  const hasFlaggedNewIn = products.some((product) => product.isNewIn);

  return (
    <>
      {isHeroReady ? (
        <HeroCarousel slides={slides} />
      ) : (
        <div className="home-hero-placeholder">
          <LoadingSpinner label="Loading featured collections" />
        </div>
      )}

      {/* Cultural flow: Aso Oke woven design system flowing from benefits strip downward */}
      <div className="home-cultural-flow">
        <TrustStrip />

        {!isLoading ? (
          <div className="home-section home-section--shop-by container">
            <DiscoveryModule
              module={shopByModule}
              className="discovery--home"
              groupNavigation="arrows"
              viewAllTo="/shop"
            />
          </div>
        ) : null}

        <NewIn
          products={newInProducts}
          isLoading={isLoading}
          error={error}
          viewAllTo={hasFlaggedNewIn ? "/shop?newin=1" : "/shop"}
        />

        <CustomStylePromo image={customStyleImage} />

        <ReviewsPreview entries={reviews} />

        <StyleCircle />
      </div>
    </>
  );
}
