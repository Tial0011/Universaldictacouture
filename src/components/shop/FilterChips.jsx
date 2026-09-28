/**
 * Active Shop context/refinements. Each chip removes exactly one committed
 * value; the primary Clear All action lives here on the results surface.
 */
export default function FilterChips({ chips, onRemove, onClearAll }) {
  if (!chips.length) return null;

  return (
    <div className="filter-chips">
      <h2 className="visually-hidden">Active Shop refinements</h2>
      <div className="filter-chips__row">
        <span className="filter-chips__label" aria-hidden="true">
          Active:
        </span>
        <ul className="filter-chips__list">
          {chips.map((chip) => (
            <li key={chip.id}>
              <button
                type="button"
                className="filter-chips__chip"
                onClick={() => onRemove(chip)}
                aria-label={`Remove ${chip.label}`}
              >
                <span>{chip.text ?? chip.label}</span>
                <span className="filter-chips__x" aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="filter-chips__clear" onClick={onClearAll}>
          Clear All
        </button>
      </div>
    </div>
  );
}
