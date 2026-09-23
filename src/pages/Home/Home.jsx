import { useEffect, useMemo, useState } from "react";
import HeroCarousel from "../../components/home/HeroCarousel";
import TrustStrip from "../../components/home/TrustStrip";
import DiscoveryModule from "../../components/discovery/DiscoveryModule";
import OccasionIllustration from "../../components/discovery/OccasionIllustration";
import NewIn from "../../components/home/NewIn";
import CustomStylePromo from "../../components/home/CustomStylePromo";
import ReviewsPreview from "../../components/home/ReviewsPreview";
import StyleCircle from "../../components/home/StyleCircle";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import { useCatalogue } from "../../hooks/useCatalogue";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import heroReadyToWear from "../../assets/images/hero/hero-ready-to-wear.jpg";
import weddingGuestImage from "../../assets/images/occasions/wedding-guest.jpg";
import bridalImage from "../../assets/images/occasions/bridal.jpg";
import traditionalEngagementImage from "../../assets/images/occasions/traditional-engagement.jpg";
import celebrationImage from "../../assets/images/occasions/celebration.jpg";
import churchEventImage from "../../assets/images/occasions/church-event.jpg";
import {
  APPROVED_HERO_COPY,
  SHOP_DISCOVERY_GROUPS,
  buildShopDiscovery,
  fetchCustomStylePromo,
  fetchDiscoveryModule,
  fetchHeroSlides,
  fetchPublishedReviews,
} from "../../services/content";
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

const OCCASION_IMAGES = {
  "Wedding Guest": weddingGuestImage,
  Bridal: bridalImage,
  "Traditional Engagement": traditionalEngagementImage,
  Celebration: celebrationImage,
  "Church/Event": churchEventImage,
};

export default function Home() {
  const { products, isLoading, error } = useCatalogue();
  const [slides, setSlides] = useState(FALLBACK_SLIDE);
  const [discovery, setDiscovery] = useState(null);
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

    fetchDiscoveryModule("home").then((module) => {
      if (active && module) setDiscovery(module);
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

  const shopByModule = useMemo(() => {
    const catalogue = buildShopDiscovery(products);
    const items = SHOP_DISCOVERY_GROUPS.flatMap((group) => {
      const adminGroup = discovery?.groups?.find(
        (entry) => entry.label.trim().replace(/^Shop by\s+/i, "").toLowerCase() === group.label.toLowerCase()
      );
      const adminItems = discovery?.items.filter((item) =>
        adminGroup
          ? item.group === adminGroup.id || (group.id === "occasion" && !item.group)
          : group.id === "occasion" && !item.group
      ) ?? [];
      const categoryItems = adminItems.length
        ? adminItems
        : catalogue?.items.filter((item) => item.group === group.id) ?? [];

      return categoryItems.map((item) => {
        const occasionImage = group.id === "occasion" && OCCASION_IMAGES[item.name]
          ? { url: OCCASION_IMAGES[item.name], alt: "" }
          : null;

        return {
          ...item,
          id: `${group.id}-${item.id}`,
          group: group.id,
          image: adminItems.length ? item.image ?? occasionImage : occasionImage ?? item.image,
        };
      });
    });

    return { id: "home-shop-by", title: "Shop By", groups: SHOP_DISCOVERY_GROUPS, items };
  }, [discovery, products]);
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

      <TrustStrip />

      {!isLoading || discovery ? (
        <div className="home-section home-section--shop-by container">
          <DiscoveryModule
            module={shopByModule}
            className="discovery--home"
            groupNavigation="arrows"
            viewAllTo="/shop"
            renderMedia={(item) =>
              item.group === "occasion" && !item.image ? <OccasionIllustration name={item.name} /> : null
            }
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
    </>
  );
}
