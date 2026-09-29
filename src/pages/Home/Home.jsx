import { useEffect, useMemo, useState } from "react";
import HeroCarousel from "../../components/home/HeroCarousel";
import TrustStrip from "../../components/home/TrustStrip";
import DiscoveryModule from "../../components/discovery/DiscoveryModule";
import NewIn from "../../components/home/NewIn";
import CustomStylePromo from "../../components/home/CustomStylePromo";
import ReviewsPreview from "../../components/home/ReviewsPreview";
import StyleCircle from "../../components/home/StyleCircle";

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

import "../../components/home/home-sections.css";
import "./Home.css";

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
  const [reviewState, setReviewState] = useState({ entries: [], loading: true, error: "" });
  const [reviewAttempt, setReviewAttempt] = useState(0);
  const [customStyleImage, setCustomStyleImage] = useState({
    url: heroReadyToWear,
    publicId: "",
    alt: "",
  });


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
      .catch(() => { /* Keep the local hero visible when remote content is offline. */ });

    fetchShopByGroups().then((groups) => {
      if (active) setShopByGroups(groups);
    });

    fetchCustomStylePromo().then((result) => {
      if (active && result.image) setCustomStyleImage(result.image);
    });

    return () => {
      active = false;
    };
  }, []);


  useEffect(() => {
    let active = true;
    setReviewState((previous) => ({ ...previous, loading: true, error: "" }));
    fetchPublishedReviews(20, true)
      .then((entries) => { if (active) setReviewState({ entries, loading: false, error: "" }); })
      .catch(() => { if (active) setReviewState({ entries: [], loading: false, error: "Reviews could not be loaded. Please try again." }); });
    return () => { active = false; };
  }, [reviewAttempt]);

  const shopByModule = useMemo(
    () => buildShopDiscovery(products, "Shop By", shopByGroups),
    [products, shopByGroups]
  );
  // New In is an admin-managed merchandising context. The homepage
  // previews the first 20 valid members; View all reopens that same
  // context in Shop instead of conflating it with Newest First.
  const newInProducts = selectNewIn(products, 20);

  return (
    <>
      <HeroCarousel slides={slides} />

      {/* Cultural flow: Aso Oke woven design system flowing from benefits strip downward */}
      <div className="home-cultural-flow">
        <TrustStrip />

        {!isLoading ? (
          <div className="home-section home-section--shop-by container">
            <DiscoveryModule
              module={shopByModule}
              className="discovery--home"
              groupNavigation="arrows"
              viewAllTo={(groupId) => groupId ? `/shop?discovery=${encodeURIComponent(groupId)}` : "/shop"}
            />
          </div>
        ) : null}

        <NewIn
          products={newInProducts}
          isLoading={isLoading}
          error={error}
          viewAllTo="/shop?newin=1"
        />

        <CustomStylePromo image={customStyleImage} />

        <ReviewsPreview
          entries={reviewState.entries}
          products={products}
          isLoading={reviewState.loading}
          error={reviewState.error}
          onRetry={() => setReviewAttempt((value) => value + 1)}
        />

        <StyleCircle />
      </div>
    </>
  );
}
