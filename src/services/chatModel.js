export const MESSAGE_LIMIT = 2000;
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
