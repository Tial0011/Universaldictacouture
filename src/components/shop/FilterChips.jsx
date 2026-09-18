export default function FilterChips({ chips, onRemove, onClearAll }) {
  if (!chips.length) return null;

  return (
    <div className="filter-chips">
      <h2 className="visually-hidden">Active refinements</h2>
      <ul className="filter-chips__list">
        {chips.map((chip) => (
          <li key={chip.id}>
            <button type="button" className="filter-chips__chip" onClick={() => onRemove(chip)}>
              <span>{chip.label}</span>
              <span aria-hidden="true">×</span>
              <span className="visually-hidden">Remove</span>
            </button>
          </li>
        ))}
        <li>
          <button type="button" className="filter-chips__clear" onClick={onClearAll}>
            Clear All
          </button>
        </li>
      </ul>
    </div>
  );
}
