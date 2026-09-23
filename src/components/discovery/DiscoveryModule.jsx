import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ProductImage from "../product/ProductImage";
import ViewAllLink from "../common/ViewAllLink";
import "./DiscoveryModule.css";

function GroupArrow({ direction }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={direction === "previous" ? "m14.5 5-7 7 7 7" : "m9.5 5 7 7-7 7"} />
    </svg>
  );
}

/**
 * Configurable discovery module (Shop by Occasion and friends).
 *
 * The module, its groups/tabs, item names, imagery, ordering,
 * destinations and publication state all come from the data layer —
 * the taxonomy is never hard-coded here. Items with no name or no
 * valid destination are filtered out upstream, so anything reaching
 * this component is safe to render.
 *
 * Optional props:
 *  - resolveDestination(item): lets a caller rewrite where a tile
 *    leads (Shop uses it to add a tile's filter to the current
 *    refinements instead of replacing them).
 *  - hideTitleWithTabs: when the module has tabs, the tabs act as the
 *    heading, so the title is kept for assistive tech only.
 *  - groupNavigation: homepage arrows or the existing Shop tabs.
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
}) {
  const [activeGroup, setActiveGroup] = useState(module?.groups?.[0]?.id ?? "");
  const tabRefs = useRef({});
  const Heading = headingLevel;

  const groups = module?.groups;
  const arrowNavigation = groupNavigation === "arrows" && groups?.length > 0;
  // The module can be swapped after first render (an admin-managed one
  // replacing the fallback), so a remembered tab that no longer exists
  // falls back to the first one rather than emptying the list.
  const currentGroup = groups?.some((group) => group.id === activeGroup)
    ? activeGroup
    : (groups?.[0]?.id ?? "");

  const items = useMemo(() => {
    if (!module) return [];
    if (!groups?.length) return module.items;
    if (arrowNavigation) return module.items.filter((item) => item.group === currentGroup);
    return module.items.filter((item) => !item.group || item.group === currentGroup);
  }, [module, groups, currentGroup, arrowNavigation]);

  if (!module || (!arrowNavigation && !items.length)) return null;

  const hasTabs = !arrowNavigation && groups?.length > 1;
  const currentIndex = groups?.findIndex((group) => group.id === currentGroup) ?? -1;
  const activeTitle = arrowNavigation ? `Shop by ${groups[currentIndex].label}` : module.title;

  // The last word of the title gets the accent colour (e.g. "Shop by
  // Occasion" → "Occasion" in wine) — a display treatment only, the
  // title text itself is unchanged.
  const titleWords = activeTitle.trim().split(" ");
  const titleLead = titleWords.slice(0, -1).join(" ");
  const titleAccent = titleWords.slice(-1).join(" ");

  const selectGroup = (id, { focus = false } = {}) => {
    setActiveGroup(id);
    if (focus) tabRefs.current[id]?.focus();
  };

  // Left/Right/Home/End move between tabs, as tab lists conventionally do.
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

  return (
    <section className={`discovery ${className}`.trim()} aria-labelledby={`discovery-${module.id}`}>
      <div className={`discovery__head${hasTabs && hideTitleWithTabs ? " visually-hidden" : ""}`}>
        <Heading id={`discovery-${module.id}`} className="discovery__title" aria-live={arrowNavigation ? "polite" : undefined}>
          {arrowNavigation ? "Shop by " : titleLead ? `${titleLead} ` : ""}
          <span className="discovery__title-accent">{arrowNavigation ? groups[currentIndex].label : titleAccent}</span>
        </Heading>
        {arrowNavigation ? (
          <div className="discovery__head-actions">
            <div className="discovery__group-arrows" role="group" aria-label="Shop By groups">
              <button type="button" className="discovery__group-arrow" aria-label="Previous Shop By group" aria-controls={`discovery-panel-${module.id}`} disabled={currentIndex === 0} onClick={() => selectGroup(groups[currentIndex - 1].id)}>
                <GroupArrow direction="previous" />
              </button>
              <button type="button" className="discovery__group-arrow" aria-label="Next Shop By group" aria-controls={`discovery-panel-${module.id}`} disabled={currentIndex === groups.length - 1} onClick={() => selectGroup(groups[currentIndex + 1].id)}>
                <GroupArrow direction="next" />
              </button>
            </div>
            {viewAllTo ? <ViewAllLink to={viewAllTo} /> : null}
          </div>
        ) : viewAllTo ? <ViewAllLink to={viewAllTo} /> : null}
      </div>

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

      {items.length ? (
        <ul
          key={arrowNavigation ? currentGroup : undefined}
          className="discovery__list"
          id={`discovery-panel-${module.id}`}
          role={hasTabs ? "tabpanel" : undefined}
          aria-labelledby={hasTabs ? `discovery-tab-${currentGroup}` : undefined}
        >
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={resolveDestination ? resolveDestination(item) : item.destination}
                className="discovery__item"
              >
                <span className="discovery__media">
                  {(renderMedia && renderMedia(item)) ?? (
                    <ProductImage
                      image={item.image}
                      alt=""
                      transformation="w_420,h_420,c_fill,g_auto,q_auto,f_auto"
                    />
                  )}
                </span>
                <span className="discovery__name">{item.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p id={`discovery-panel-${module.id}`} className="discovery__empty">No categories are available in this group yet.</p>
      )}
    </section>
  );
}
