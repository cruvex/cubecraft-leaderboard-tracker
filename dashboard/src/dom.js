// Small DOM / formatting helpers shared across modules.

/** @param {string} id */
export const el = (id) => document.getElementById(id);

/** Read a CSS custom property (theme variable) off the document root. */
export function getStyle(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Format a 32-char UUID into the dashed form; pass anything else through. */
export function formatUuid(uuid) {
  if (!uuid) return "";
  if (uuid.length === 32)
    return uuid.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
  return uuid;
}
