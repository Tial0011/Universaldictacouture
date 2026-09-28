import { useEffect, useId, useState } from "react";

/**
 * Shared Shop filter panel used by the desktop sidebar and the mobile
 * filter sheet. Checkboxes are OR within a dimension; dimensions combine
 * with AND. Public catalogue counts are deliberately not displayed.
 */
export default function ShopFilters({
  facets,
  state,
  onToggleValue,
  onToggleNewIn,
  onPriceChange,
  onClearAll,
  onValidityChange,
  hasRefinements,
  idPrefix = "filters",
  showClear = true,
}) {
  const priceId = useId();
  const [min, setMin] = useState(state.min === null ? "" : String(state.min));
  const [max, setMax] = useState(state.max === null ? "" : String(state.max));
  const [priceError, setPriceError] = useState("");

  useEffect(() => {
    setMin(state.min === null ? "" : String(state.min));
    setMax(state.max === null ? "" : String(state.max));
    setPriceError("");
    onValidityChange?.(true);
  }, [state.min, state.max, onValidityChange]);

  const syncPrice = (nextMin, nextMax) => {
    const minValue = nextMin === "" ? null : Number(nextMin);
    const maxValue = nextMax === "" ? null : Number(nextMax);

    let error = "";
    if ((minValue !== null && !Number.isFinite(minValue)) ||
      (maxValue !== null && !Number.isFinite(maxValue))) {
      error = "Enter prices as numbers.";
    } else if ((minValue !== null && minValue < 0) || (maxValue !== null && maxValue < 0)) {
      error = "Prices cannot be negative.";
    } else if (minValue !== null && maxValue !== null && minValue > maxValue) {
      error = "Minimum Price must not exceed Maximum Price.";
    }

    setPriceError(error);
    onValidityChange?.(!error);
    if (!error) onPriceChange(minValue, maxValue);
  };

  const changeMin = (value) => {
    setMin(value);
    syncPrice(value, max);
  };

  const changeMax = (value) => {
    setMax(value);
    syncPrice(min, value);
  };

  return (
    <div className="shop-filters">
      <div className="shop-filters__head">
        <div>
          <p className="shop-filters__eyebrow">Refine the collection</p>
          <h2 className="shop-filters__title">Filters</h2>
        </div>
        {showClear && hasRefinements ? (
          <button type="button" className="shop-filters__clear" onClick={onClearAll}>
            Clear All
          </button>
        ) : null}
      </div>

      <fieldset className="shop-filters__group">
        <legend className="field__label">Collection</legend>
        <label className="choice">
          <input
            type="checkbox"
            checked={state.newIn}
            onChange={(event) => onToggleNewIn(event.target.checked)}
          />
          <span>New In</span>
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
                  <span>{entry.value}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      <fieldset className="shop-filters__group shop-filters__price">
        <legend className="field__label">Price Range (₦)</legend>
        <div className="shop-filters__price-inputs">
          <div className="field">
            <label className="field__label" htmlFor={`${idPrefix}-${priceId}-min`}>
              Minimum Price
            </label>
            <input
              id={`${idPrefix}-${priceId}-min`}
              className="form-control"
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={min}
              onChange={(event) => changeMin(event.target.value)}
              aria-describedby={`${idPrefix}-${priceId}-error`}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${idPrefix}-${priceId}-max`}>
              Maximum Price
            </label>
            <input
              id={`${idPrefix}-${priceId}-max`}
              className="form-control"
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={max}
              onChange={(event) => changeMax(event.target.value)}
              aria-describedby={`${idPrefix}-${priceId}-error`}
            />
          </div>
        </div>
        <p className="field__error" id={`${idPrefix}-${priceId}-error`} role="alert">
          {priceError}
        </p>
      </fieldset>
    </div>
  );
}
