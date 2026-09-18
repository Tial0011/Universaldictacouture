/**
 * Text helpers for product search.
 *
 * Search must be case-insensitive, tolerant of extra whitespace and of
 * simple punctuation, so every searchable string is reduced to a
 * lowercase, accent-free, punctuation-free token stream before it is
 * compared.
 */

export function normaliseText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value) {
  const normalised = normaliseText(value);
  return normalised ? normalised.split(" ") : [];
}

/**
 * A product matches when every token in the query appears somewhere in
 * its searchable text (name, taxonomy, admin aliases, admin keywords).
 */
export function matchesQuery(haystack, query) {
  const tokens = tokenize(query);
  if (!tokens.length) return true;
  return tokens.every((token) => haystack.includes(token));
}

/** Compare two values for slug-ish equality (used by filters). */
export function slugify(value) {
  return normaliseText(value).replace(/\s+/g, "-");
}
