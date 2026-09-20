import { useEffect, useState } from "react";
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
import {
  APPROVED_HERO_COPY,
  approvedOccasionPlaceholders,
  buildOccasionDiscovery,
  fetchCustomStylePromo,
  fetchDiscoveryModule,
  fetchHeroSlides,
  fetchPublishedReviews,
} from "../../services/content";
import { selectNewIn } from "../../services/products";
import { SAMPLE_PIECES, SAMPLE_PIECES_ENABLED } from "../../services/samplePieces";
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

  // Admin-managed discovery wins; then whatever occasions genuinely
  // exist in the published catalogue; otherwise the approved
  // occasions still show, illustrated rather than photographed,
  // until real photos are published for them.
  const discoveryModule =
    discovery ?? buildOccasionDiscovery(products) ?? approvedOccasionPlaceholders();
  const realNewIn = selectNewIn(products, 6);
  // In preview mode, an unreachable or still-empty catalogue is covered
  // by sample pieces so the section is never blank (see samplePieces.js).
  const showSamples =
    SAMPLE_PIECES_ENABLED && !isLoading && (Boolean(error) || realNewIn.length === 0);
  const newInProducts = showSamples ? SAMPLE_PIECES : realNewIn;
  // "View all" goes to the New In filter only when pieces are actually
  // flagged New In; otherwise the section is showing the newest pieces
  // and the whole collection is the honest destination.
  // Pieces without an uploaded photo borrow the hero photograph.
  const heroImage = slides.find((slide) => slide.image)?.image ?? FALLBACK_SLIDE[0].image;
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

      {discoveryModule ? (
        <div className="home-section container">
          <DiscoveryModule
            module={discoveryModule}
            className="discovery--home"
            viewAllTo="/shop"
            renderMedia={(item) =>
              item.image ? null : <OccasionIllustration name={item.name} />
            }
          />
        </div>
      ) : null}

      <NewIn
        products={newInProducts}
        isLoading={isLoading}
        error={showSamples ? null : error}
        isSample={showSamples}
        fallbackImage={heroImage}
        viewAllTo={hasFlaggedNewIn ? "/shop?newin=1" : "/shop"}
      />

      <CustomStylePromo image={customStyleImage} />

      <ReviewsPreview entries={reviews} />

      <StyleCircle />
    </>
  );
}
