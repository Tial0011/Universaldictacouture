import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ProductImage from "../product/ProductImage";
import "./HeroCarousel.css";

const ROTATION_MS = 7000;
const SWIPE_THRESHOLD = 40;

function usePrefersReducedMotion() {
  // Read once during initialisation so the first render is already
  // correct, then keep it in step with the media query.
  const [prefers, setPrefers] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event) => setPrefers(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return prefers;
}

function Chevron({ direction }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={direction === "previous" ? "m14.5 5-7 7 7 7" : "m9.5 5 7 7-7 7"} />
    </svg>
  );
}

export default function HeroCarousel({ slides }) {
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStart = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const count = slides.length;

  const goTo = useCallback(
    (next) => {
      setIndex(((next % count) + count) % count);
      // Any interaction pauses and resets the rotation, so the reader
      // is never moved off the slide they chose.
      setIsPaused(true);
    },
    [count]
  );

  useEffect(() => {
    if (count < 2 || isPaused || prefersReducedMotion) return undefined;
    const timer = setTimeout(() => setIndex((current) => (current + 1) % count), ROTATION_MS);
    return () => clearTimeout(timer);
  }, [index, count, isPaused, prefersReducedMotion]);

  const onKeyDown = (event) => {
    if (count < 2) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(index + 1);
    }
  };

  const onTouchStart = (event) => {
    touchStart.current = event.touches[0].clientX;
  };

  const onTouchEnd = (event) => {
    if (touchStart.current === null) return;
    const delta = event.changedTouches[0].clientX - touchStart.current;
    touchStart.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    goTo(delta < 0 ? index + 1 : index - 1);
  };

  return (
    <section
      className="hero"
      aria-roledescription={count > 1 ? "carousel" : undefined}
      aria-label="Featured collections"
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onMouseEnter={() => setIsPaused(true)}
      onFocus={() => setIsPaused(true)}
    >
      <div className="hero__viewport">
        {slides.map((item, slideIndex) => (
          <div
            key={item.id}
            className={`hero__slide${slideIndex === index ? " is-current" : ""}`}
            role={count > 1 ? "group" : undefined}
            aria-roledescription={count > 1 ? "slide" : undefined}
            aria-label={count > 1 ? `${slideIndex + 1} of ${count}` : undefined}
            aria-hidden={slideIndex === index ? undefined : true}
            inert={slideIndex === index ? undefined : true}
          >
            <div className="hero__media">
              <ProductImage
                image={item.imageMobile || item.image}
                alt=""
                className="hero__image hero__image--mobile"
                loading={slideIndex === 0 ? "eager" : "lazy"}
                transformation="w_900,h_1100,c_fill,g_auto,q_auto,f_auto"
              />
              <ProductImage
                image={item.image}
                alt=""
                className="hero__image hero__image--desktop"
                loading={slideIndex === 0 ? "eager" : "lazy"}
                transformation="w_1800,h_1000,c_fill,g_auto,q_auto,f_auto"
              />
            </div>

            <div className="container hero__content">
              <p className="hero__eyebrow">{item.eyebrow}</p>
              <h1 className="hero__headline">
                {item.headline}
                <span className="hero__secondary">{item.secondary}</span>
              </h1>
              <p className="hero__body">{item.body}</p>
              <div className="hero__actions">
                <Link className="btn btn--primary" to={item.primaryCta.to}>
                  {item.primaryCta.label}
                </Link>
                <Link className="btn btn--secondary" to={item.secondaryCta.to}>
                  {item.secondaryCta.label}
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {count > 1 ? (
        <>
          <button
            type="button"
            className="hero__control hero__control--previous"
            onClick={() => goTo(index - 1)}
            aria-label="Previous slide"
          >
            <Chevron direction="previous" />
          </button>
          <button
            type="button"
            className="hero__control hero__control--next"
            onClick={() => goTo(index + 1)}
            aria-label="Next slide"
          >
            <Chevron direction="next" />
          </button>

          <div className="hero__pagination">
            {slides.map((item, slideIndex) => (
              <button
                key={item.id}
                type="button"
                className={`hero__dot${slideIndex === index ? " is-current" : ""}`}
                onClick={() => goTo(slideIndex)}
                aria-label={`Go to slide ${slideIndex + 1}`}
                aria-current={slideIndex === index ? "true" : undefined}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
