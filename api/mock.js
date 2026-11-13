// POST /api/mock – Mock eines Kernbanksystems (REST). Nimmt nur pseudonymisierte, fiktive Daten an.
export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt." });
  const b = req.body || {};
  const ok = typeof b.kategorie === "string" && typeof b.prioritaet === "string" && typeof b.referenz === "string";
  if (!ok) return res.status(422).json({ error: "Pflichtfelder fehlen: kategorie, prioritaet, referenz" });
  const ticketId = "VB-DEMO-" + Math.random().toString(36).slice(2, 8).toUpperCase();
  return res.status(201).json({ ticketId, status: "angelegt", kategorie: b.kategorie, prioritaet: b.prioritaet, empfangen: new Date().toISOString(), hinweis: "Mock-Service mit fiktiven Daten" });
}
