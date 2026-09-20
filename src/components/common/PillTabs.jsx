import "./PillTabs.css";

/**
 * Generic pill-shaped tab bar — a small "menu" above a grid of cards
 * that filters what's shown below it. Options come entirely from
 * whatever the caller passes in (real data only); nothing is invented
 * here.
 */
export default function PillTabs({ tabs, activeId, onChange, label }) {
  if (!tabs?.length) return null;

  return (
    <div className="pill-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeId}
          className={`pill-tabs__tab${tab.id === activeId ? " is-active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
