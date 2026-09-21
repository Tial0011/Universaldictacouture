import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ProductImage from "../product/ProductImage";
import ViewAllLink from "../common/ViewAllLink";
import "./DiscoveryModule.css";

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
 */
export default function DiscoveryModule({
  module,
  headingLevel = "h2",
  className = "",
  viewAllTo,
  renderMedia,
  resolveDestination,
  hideTitleWithTabs = false,
}) {
  const [activeGroup, setActiveGroup] = useState(module?.groups?.[0]?.id ?? "");
  const tabRefs = useRef({});
  const Heading = headingLevel;

  const groups = module?.groups;
  // The module can be swapped after first render (an admin-managed one
  // replacing the fallback), so a remembered tab that no longer exists
  // falls back to the first one rather than emptying the list.
  const currentGroup = groups?.some((group) => group.id === activeGroup)
    ? activeGroup
    : (groups?.[0]?.id ?? "");

  const items = useMemo(() => {
    if (!module) return [];
    if (!groups?.length) return module.items;
    return module.items.filter((item) => !item.group || item.group === currentGroup);
  }, [module, groups, currentGroup]);

  if (!module || !items.length) return null;

  const hasTabs = groups?.length > 1;

  // The last word of the title gets the accent colour (e.g. "Shop by
  // Occasion" → "Occasion" in wine) — a display treatment only, the
  // title text itself is unchanged.
  const titleWords = module.title.trim().split(" ");
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
        <Heading id={`discovery-${module.id}`} className="discovery__title">
          {titleLead ? `${titleLead} ` : ""}
          <span className="discovery__title-accent">{titleAccent}</span>
        </Heading>
        {viewAllTo ? <ViewAllLink to={viewAllTo} /> : null}
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

      <ul
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
    </section>
  );
}
