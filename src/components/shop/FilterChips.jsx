/**
 * The row of active refinements: "Active Filters:" then one removable
 * chip per refinement, with Clear All at the far end. The chips show
 * the short value ("Burgundy"); the full name ("Colour: Burgundy")
 * is what assistive tech hears.
 */
export default function FilterChips({ chips, onRemove, onClearAll }) {
  if (!chips.length) return null;

  return (
    <div className="filter-chips">
      <h2 className="visually-hidden">Active refinements</h2>
      <div className="filter-chips__row">
        <span className="filter-chips__label" aria-hidden="true">
          Active Filters:
        </span>
        <ul className="filter-chips__list">
          {chips.map((chip) => (
            <li key={chip.id}>
              <button type="button" className="filter-chips__chip" onClick={() => onRemove(chip)}>
                <span>{chip.text ?? chip.label}</span>
                <span className="filter-chips__x" aria-hidden="true">
                  ×
                </span>
                <span className="visually-hidden">Remove {chip.label}</span>
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
