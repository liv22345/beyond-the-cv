const hits = new Map();
export function tooMany(req, limit = 30) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || "unknown";
  const now = Date.now(), win = 60 * 60 * 1000;
  const list = (hits.get(ip) || []).filter(t => now - t < win);
  list.push(now); hits.set(ip, list);
  return list.length > limit;
}
export async function claude(body) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, ...body })
  });
  if (!r.ok) { console.error("Claude API Fehler", r.status, (await r.text()).slice(0, 300)); throw new Error("api"); }
  return r.json();
}
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
