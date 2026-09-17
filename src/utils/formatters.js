/**
 * Format a kobo/naira amount as a Naira display string.
 * Amount is expected in the smallest currency unit is NOT assumed —
 * pass the amount in naira directly; adjust here if later phases
 * store amounts in kobo.
 */
export function formatNaira(amount) {
  if (typeof amount !== "number" || Number.isNaN(amount)) return "";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function truncateText(text, maxLength = 120) {
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}
