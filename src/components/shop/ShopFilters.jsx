import { useEffect, useId, useState } from "react";

/**
 * Filter panel. The same component fills the desktop sidebar and the
 * mobile drawer, so the two can never drift apart.
 *
 * Checkboxes within a dimension are OR; dimensions combine with AND.
 * The price range is applied on submit rather than on every keystroke,
 * which keeps a half-typed number from emptying the grid.
 */
export default function ShopFilters({
  facets,
  state,
  onToggleValue,
  onToggleNewIn,
  onPriceChange,
  onClearAll,
  hasRefinements,
  idPrefix = "filters",
}) {
  const priceId = useId();
  const [min, setMin] = useState(state.min === null ? "" : String(state.min));
  const [max, setMax] = useState(state.max === null ? "" : String(state.max));
  const [priceError, setPriceError] = useState("");

  // Keep the inputs aligned with the URL (Back/Forward, Clear All).
  useEffect(() => {
    setMin(state.min === null ? "" : String(state.min));
    setMax(state.max === null ? "" : String(state.max));
    setPriceError("");
  }, [state.min, state.max]);

  const applyPrice = (event) => {
    event.preventDefault();
    const minValue = min === "" ? null : Number(min);
    const maxValue = max === "" ? null : Number(max);

    if ((minValue !== null && !Number.isFinite(minValue)) ||
      (maxValue !== null && !Number.isFinite(maxValue))) {
      setPriceError("Enter prices as numbers.");
      return;
    }
    if (minValue !== null && minValue < 0) {
      setPriceError("Prices cannot be negative.");
      return;
    }
    if (minValue !== null && maxValue !== null && minValue > maxValue) {
      setPriceError("The lowest price must be less than the highest.");
      return;
    }

    setPriceError("");
    onPriceChange(minValue, maxValue);
  };

  return (
    <div className="shop-filters">
      <div className="shop-filters__head">
        <h2 className="shop-filters__title">Filter</h2>
        {hasRefinements ? (
          <button type="button" className="shop-filters__clear" onClick={onClearAll}>
            Clear All
          </button>
        ) : null}
      </div>

      <fieldset className="shop-filters__group">
        <legend className="field__label">New In</legend>
        <label className="choice">
          <input
            type="checkbox"
            checked={state.newIn}
            onChange={(event) => onToggleNewIn(event.target.checked)}
          />
          <span>Show New In only</span>
        </label>
      </fieldset>

      {facets.map((dimension) => (
        <fieldset key={dimension.key} className="shop-filters__group">
          <legend className="field__label">{dimension.label}</legend>
          <div className="shop-filters__values">
            {dimension.values.map((entry) => {
              const checked = (state.filters?.[dimension.key] ?? []).includes(entry.value);
              return (
                <label className="choice" key={`${dimension.key}-${entry.value}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleValue(dimension.key, entry.value)}
                  />
                  <span>
                    {entry.value}
                    <span className="shop-filters__count"> ({entry.count})</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      <form className="shop-filters__group shop-filters__price" onSubmit={applyPrice} noValidate>
        <fieldset>
          <legend className="field__label">Price Range (₦)</legend>
          <div className="shop-filters__price-inputs">
            <div className="field">
              <label className="field__label" htmlFor={`${idPrefix}-${priceId}-min`}>
                Lowest
              </label>
              <input
                id={`${idPrefix}-${priceId}-min`}
                className="form-control"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={min}
                onChange={(event) => setMin(event.target.value)}
                aria-describedby={`${idPrefix}-${priceId}-error`}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor={`${idPrefix}-${priceId}-max`}>
                Highest
              </label>
              <input
                id={`${idPrefix}-${priceId}-max`}
                className="form-control"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={max}
                onChange={(event) => setMax(event.target.value)}
                aria-describedby={`${idPrefix}-${priceId}-error`}
              />
            </div>
          </div>
          <p className="field__error" id={`${idPrefix}-${priceId}-error`} role="alert">
            {priceError}
          </p>
          <button type="submit" className="btn btn--secondary shop-filters__apply">
            Apply price range
          </button>
        </fieldset>
      </form>
    </div>
  );
}
