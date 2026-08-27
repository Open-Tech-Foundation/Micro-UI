const MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const RE = /[&<>"']/g;

export function escapeText(s: string): string {
  return s.replace(RE, (c) => MAP[c]);
}
