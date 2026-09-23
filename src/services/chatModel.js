export const MESSAGE_LIMIT = 2000;

/** A reviewable enquiry, never an order or an automatically sent message. */
export function closetEnquiry(lines) {
  const introduction = "Hello, I would like to ask about these pieces:";
  let draft = introduction;
  let included = 0;
  for (const line of lines) {
    const options = Object.entries(line.selections || {}).map(([name, value]) => `${name}: ${value}`).join(", ");
    const item = `\n\n${line.name} (quantity: ${line.quantity})${options ? `\n${options}` : ""}\n/shop/${encodeURIComponent(line.slug || line.productId)}`;
    // Leave room for a note when a large closet needs a follow-up message.
    if (draft.length + item.length > MESSAGE_LIMIT - 100) break;
    draft += item;
    included++;
  }
  if (included < lines.length) draft += `\n\nI also have ${lines.length - included} more selection(s) to discuss.`;
  return draft;
}
export function prepareMessage(text) {
  const body = typeof text === "string" ? text.trim() : "";
  if (!body) throw new Error("Write a message before sending.");
  if (body.length > MESSAGE_LIMIT) throw new Error("Keep your message within 2,000 characters.");
  return body;
}
export function mergeMessages(...pages) {
  const unique = new Map(pages.flat().map(message => [message.id, message]));
  return [...unique.values()].sort((a, b) => {
    const left = a.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
    const right = b.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
    return left - right || a.id.localeCompare(b.id);
  });
}
