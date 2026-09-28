import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ProductImage from "../product/ProductImage";
import ViewAllLink from "../common/ViewAllLink";
import StitchArrowIcon from "../common/icons/StitchArrowIcon";
import "./DiscoveryModule.css";
import "./HomeDiscovery.css";

function GroupArrow({ direction }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={direction === "previous" ? "M12.5 15L7.5 10L12.5 5" : "M7.5 5L12.5 10L7.5 15"} />
    </svg>
  );
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Configurable discovery module (Shop by Occasion, Style, Fabric & Pattern).
 *
 * The module, its groups/tabs, item names, imagery, ordering,
 * destinations and publication state all come from the data layer —
 * the taxonomy is never hard-coded here. Items with no name or no
 * valid destination are filtered out upstream, so anything reaching
 * this component is safe to render.
 */
export default function DiscoveryModule({
  module,
  headingLevel = "h2",
  className = "",
  viewAllTo,
  renderMedia,
  resolveDestination,
  hideTitleWithTabs = false,
  groupNavigation = "tabs",
  activeGroup: controlledActiveGroup,
  onGroupChange,
  railControls = false,
  onItemClick,
}) {
  const [internalActiveGroup, setInternalActiveGroup] = useState(module?.groups?.[0]?.id ?? "");
  const tabRefs = useRef({});
  const railRef = useRef(null);
  const [railState, setRailState] = useState({ previous: false, next: true });
  const isInteractingRef = useRef(false);
  const resumeTimerRef = useRef(null);
  const Heading = headingLevel;

  const shouldAutoScroll = railControls || className.includes("discovery--home");

  const groups = module?.groups;
  const arrowNavigation = groupNavigation === "arrows" && groups?.length > 0;
  const requestedGroup = controlledActiveGroup || internalActiveGroup;
  // Fall back to first group if current activeGroup doesn't exist.
  const currentGroup = groups?.some((group) => group.id === requestedGroup)
    ? requestedGroup
    : (groups?.[0]?.id ?? "");

  const items = useMemo(() => {
    if (!module) return [];
    if (!groups?.length) return module.items;
    if (arrowNavigation) return module.items.filter((item) => item.group === currentGroup);
    return module.items.filter((item) => !item.group || item.group === currentGroup);
  }, [module, groups, currentGroup, arrowNavigation]);

  const updateRailState = () => {
    const rail = railRef.current;
    if (!rail) return;
    setRailState({
      previous: rail.scrollLeft > 6,
      next: true,
    });
  };

  const handleInteractionStart = () => {
    clearTimeout(resumeTimerRef.current);
    isInteractingRef.current = true;
  };

  const handleInteractionEnd = () => {
    clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      isInteractingRef.current = false;
    }, 2400);
  };

  const handleScroll = () => {
    const rail = railRef.current;
    if (!rail) return;
    if (shouldAutoScroll && items.length > 2) {
      const halfWidth = rail.scrollWidth / 2;
      if (halfWidth > 0) {
        if (rail.scrollLeft >= halfWidth * 1.5) {
          rail.scrollLeft -= halfWidth;
        } else if (rail.scrollLeft <= 2 && isInteractingRef.current) {
          rail.scrollLeft += halfWidth;
        }
      }
    }
    updateRailState();
  };

  useEffect(() => {
    if (!shouldAutoScroll) return undefined;
    const rail = railRef.current;
    if (!rail) return undefined;

    rail.scrollTo({ left: 0, behavior: "auto" });
    const frame = requestAnimationFrame(updateRailState);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateRailState) : null;
    observer?.observe(rail);
    window.addEventListener("resize", updateRailState);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", updateRailState);
    };
  }, [currentGroup, items.length, shouldAutoScroll]);

  // Gentle, calm continuous seamless drift for the discovery rail
  useEffect(() => {
    if (!shouldAutoScroll || items.length <= 2 || prefersReducedMotion()) return undefined;
    const rail = railRef.current;
    if (!rail) return undefined;

    let animId = null;
    let lastTime = performance.now();

    const tick = (now) => {
      const dt = Math.min(now - lastTime, 50);
      lastTime = now;

      if (!isInteractingRef.current && rail) {
        const halfWidth = rail.scrollWidth / 2;
        if (halfWidth > rail.clientWidth) {
          if (rail.scrollLeft >= halfWidth) {
            rail.scrollLeft -= halfWidth;
          } else if (rail.scrollLeft <= 0) {
            rail.scrollLeft += halfWidth;
          }
          rail.scrollLeft += (dt / 1000) * 18;
          updateRailState();
        }
      }
      animId = requestAnimationFrame(tick);
    };

    const startTimer = setTimeout(() => {
      lastTime = performance.now();
      animId = requestAnimationFrame(tick);
    }, 1200);

    return () => {
      clearTimeout(startTimer);
      clearTimeout(resumeTimerRef.current);
      if (animId) cancelAnimationFrame(animId);
    };
  }, [currentGroup, items.length, shouldAutoScroll]);

  if (!module || (!groups?.length && !items.length)) return null;

  const hasTabs = !arrowNavigation && groups?.length > 1;
  const currentIndex = groups?.findIndex((group) => group.id === currentGroup) ?? -1;
  const activeTitle = arrowNavigation ? `Shop by ${groups[currentIndex].label}` : module.title;

  const titleWords = activeTitle.trim().split(" ");
  const titleLead = titleWords.slice(0, -1).join(" ");
  const titleAccent = titleWords.slice(-1).join(" ");

  const selectGroup = (id, { focus = false } = {}) => {
    if (onGroupChange) onGroupChange(id);
    else setInternalActiveGroup(id);
    if (focus) tabRefs.current[id]?.focus();
  };

  const onTabKeyDown = (event, index) => {
    const last = groups.length - 1;
    let next = null;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    selectGroup(groups[next].id, { focus: true });
  };

  const scrollRail = (direction) => {
    const rail = railRef.current;
    if (!rail) return;
    const distance = Math.max(rail.clientWidth * 0.72, 180);
    rail.scrollBy({
      left: direction === "previous" ? -distance : distance,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  };

  const resolvedViewAllTo = typeof viewAllTo === "function" ? viewAllTo(currentGroup) : viewAllTo;

  const list = items.length ? (
    <ul
      ref={shouldAutoScroll ? railRef : undefined}
      key={arrowNavigation ? currentGroup : undefined}
      className="discovery__list"
      id={`discovery-panel-${module.id}`}
      role={hasTabs ? "tabpanel" : undefined}
      aria-labelledby={hasTabs ? `discovery-tab-${currentGroup}` : arrowNavigation ? `discovery-${module.id}` : undefined}
      onScroll={shouldAutoScroll ? handleScroll : undefined}
      onMouseEnter={handleInteractionStart}
      onMouseLeave={handleInteractionEnd}
      onTouchStart={handleInteractionStart}
      onTouchEnd={handleInteractionEnd}
      onPointerDown={handleInteractionStart}
      onPointerUp={handleInteractionEnd}
    >
      {items.map((item) => (
        <li key={item.id}>
          <Link
            to={resolveDestination ? resolveDestination(item) : item.destination}
            className="discovery__item"
            onClick={() => onItemClick?.(item)}
          >
            <span className="discovery__media">
              {(renderMedia && renderMedia(item)) ?? (
                <ProductImage
                  image={item.image}
                  alt=""
                  transformation={arrowNavigation
                    ? "w_420,h_420,c_fill,g_auto,q_auto,f_auto"
                    : "w_520,h_360,c_fill,g_auto,q_auto,f_auto"}
                />
              )}
            </span>
            {arrowNavigation ? (
              <span className="discovery__caption">
                <span className="discovery__name">{item.name}</span>
                <StitchArrowIcon size={16} className="discovery__caption-arrow" />
              </span>
            ) : <span className="discovery__name">{item.name}</span>}
          </Link>
        </li>
      ))}
      {shouldAutoScroll && items.length > 2 && items.map((item) => (
        <li key={`${item.id}-dup`} aria-hidden="true">
          <Link
            to={resolveDestination ? resolveDestination(item) : item.destination}
            className="discovery__item"
            tabIndex={-1}
            onClick={() => onItemClick?.(item)}
          >
            <span className="discovery__media">
              {(renderMedia && renderMedia(item)) ?? (
                <ProductImage
                  image={item.image}
                  alt=""
                  transformation={arrowNavigation
                    ? "w_420,h_420,c_fill,g_auto,q_auto,f_auto"
                    : "w_520,h_360,c_fill,g_auto,q_auto,f_auto"}
                />
              )}
            </span>
            {arrowNavigation ? (
              <span className="discovery__caption">
                <span className="discovery__name">{item.name}</span>
                <StitchArrowIcon size={16} className="discovery__caption-arrow" />
              </span>
            ) : <span className="discovery__name">{item.name}</span>}
          </Link>
        </li>
      ))}
    </ul>
  ) : (
    <p id={`discovery-panel-${module.id}`} className="discovery__empty" role={hasTabs ? "tabpanel" : undefined} aria-labelledby={hasTabs ? `discovery-tab-${currentGroup}` : undefined}>No categories are available in this group yet. Choose another group to keep exploring.</p>
  );

  return (
    <section className={`discovery ${className}`.trim()} aria-labelledby={`discovery-${module.id}`}>
      <div className={`discovery__head${hasTabs && hideTitleWithTabs ? " visually-hidden" : ""}`}>
        <Heading id={`discovery-${module.id}`} className="discovery__title" aria-live={arrowNavigation ? "polite" : undefined}>
          {arrowNavigation ? (
            <>
              <span className="discovery__title-prefix">Shop by </span>
              <span className="discovery__title-accent">{groups[currentIndex].label}</span>
            </>
          ) : (
            <>
              {titleLead ? `${titleLead} ` : ""}
              <span className="discovery__title-accent">{titleAccent}</span>
            </>
          )}
        </Heading>
        {arrowNavigation ? (
          <div className="discovery__head-actions">
            <div className="discovery__group-arrows" role="group" aria-label="Shop By groups">
              <button
                type="button"
                className="discovery__group-arrow discovery__group-arrow--previous"
                aria-label={currentIndex > 0 ? `Previous group: ${groups[currentIndex - 1].label}` : "Previous Shop By group"}
                aria-controls={`discovery-panel-${module.id}`}
                disabled={currentIndex === 0}
                onClick={() => selectGroup(groups[currentIndex - 1].id)}
              >
                <GroupArrow direction="previous" />
              </button>
              <button
                type="button"
                className="discovery__group-arrow discovery__group-arrow--next"
                aria-label={currentIndex < groups.length - 1 ? `Next group: ${groups[currentIndex + 1].label}` : "Next Shop By group"}
                aria-controls={`discovery-panel-${module.id}`}
                disabled={currentIndex === groups.length - 1}
                onClick={() => selectGroup(groups[currentIndex + 1].id)}
              >
                <GroupArrow direction="next" />
              </button>
            </div>
            {resolvedViewAllTo ? <ViewAllLink to={resolvedViewAllTo} className="discovery__view-all" /> : null}
          </div>
        ) : resolvedViewAllTo ? <ViewAllLink to={resolvedViewAllTo} /> : null}
      </div>

      {arrowNavigation && groups.length > 1 ? (
        <div className="discovery__chapter" aria-hidden="true">
          <div className="discovery__chapter-track">
            {groups.map((group) => <span key={group.id} className={group.id === currentGroup ? "is-current" : undefined} />)}
          </div>
          <span className="discovery__position">
            {String(currentIndex + 1).padStart(2, "0")}<span> / {String(groups.length).padStart(2, "0")}</span>
          </span>
        </div>
      ) : null}

      {hasTabs ? (
        <div className="discovery__groups" role="tablist" aria-label={`${module.title} groups`}>
          {groups.map((group, index) => {
            const isActive = group.id === currentGroup;
            return (
              <button
                key={group.id}
                ref={(node) => {
                  tabRefs.current[group.id] = node;
                }}
                type="button"
                role="tab"
                id={`discovery-tab-${group.id}`}
                aria-selected={isActive}
                aria-controls={`discovery-panel-${module.id}`}
                tabIndex={isActive ? 0 : -1}
                className={`discovery__group${isActive ? " is-active" : ""}`}
                onClick={() => selectGroup(group.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
              >
                {group.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {railControls && items.length ? (
        <div
          className="discovery__rail"
          onMouseEnter={handleInteractionStart}
          onMouseLeave={handleInteractionEnd}
        >
          {railState.previous ? (
            <button
              type="button"
              className="discovery__rail-arrow discovery__rail-arrow--previous"
              aria-label={`Previous ${groups?.find((group) => group.id === currentGroup)?.label || "Shop By"} choices`}
              onClick={() => scrollRail("previous")}
            >
              <GroupArrow direction="previous" />
            </button>
          ) : null}
          {list}
          {railState.next ? (
            <button
              type="button"
              className="discovery__rail-arrow discovery__rail-arrow--next"
              aria-label={`Next ${groups?.find((group) => group.id === currentGroup)?.label || "Shop By"} choices`}
              onClick={() => scrollRail("next")}
            >
              <GroupArrow direction="next" />
            </button>
          ) : null}
        </div>
      ) : list}
    </section>
  );
}
