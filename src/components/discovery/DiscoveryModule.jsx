import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ProductImage from "../product/ProductImage";
import "./DiscoveryModule.css";

/**
 * Configurable discovery module (Shop by Occasion and friends).
 *
 * The module, its groups/tabs, item names, imagery, ordering,
 * destinations and publication state all come from the data layer —
 * the taxonomy is never hard-coded here. Items with no name or no
 * valid destination are filtered out upstream, so anything reaching
 * this component is safe to render.
 */
export default function DiscoveryModule({ module, headingLevel = "h2", className = "" }) {
  const [activeGroup, setActiveGroup] = useState(module?.groups?.[0]?.id ?? "");
  const Heading = headingLevel;

  const items = useMemo(() => {
    if (!module) return [];
    if (!module.groups?.length) return module.items;
    return module.items.filter((item) => !item.group || item.group === activeGroup);
  }, [module, activeGroup]);

  if (!module || !items.length) return null;

  return (
    <section className={`discovery ${className}`.trim()} aria-labelledby={`discovery-${module.id}`}>
      <Heading id={`discovery-${module.id}`} className="discovery__title">
        {module.title}
      </Heading>

      {module.groups?.length > 1 ? (
        <div className="discovery__groups" role="tablist" aria-label={`${module.title} groups`}>
          {module.groups.map((group) => (
            <button
              key={group.id}
              type="button"
              role="tab"
              id={`discovery-tab-${group.id}`}
              aria-selected={group.id === activeGroup}
              aria-controls={`discovery-panel-${module.id}`}
              className={`discovery__group${group.id === activeGroup ? " is-active" : ""}`}
              onClick={() => setActiveGroup(group.id)}
            >
              {group.label}
            </button>
          ))}
        </div>
      ) : null}

      <ul
        className="discovery__list"
        id={`discovery-panel-${module.id}`}
        role={module.groups?.length > 1 ? "tabpanel" : undefined}
      >
        {items.map((item) => (
          <li key={item.id}>
            <Link to={item.destination} className="discovery__item">
              <span className="discovery__media">
                <ProductImage
                  image={item.image}
                  alt=""
                  transformation="w_420,h_420,c_fill,g_auto,q_auto,f_auto"
                />
              </span>
              <span className="discovery__name">{item.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
