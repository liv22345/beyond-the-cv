// POST /api/demo – Automations-Demo eines vereinfachten Bankprozesses mit fiktiven Daten.
// Jeder Schritt wird wirklich ausgeführt; die Freigabe erfolgt durch einen Menschen.
import { tooMany, claude } from "./_lib/guard.js";

const SCENARIOS = {
  karte: { titel: "Bankomatkarte gestohlen", text: "Guten Tag, meine Bankomatkarte wurde gestern gestohlen. Bitte sperren Sie sie sofort. Max Muster, IBAN AT61 1904 3002 3457 3201, max.muster@example.com" },
  adresse: { titel: "Adressänderung", text: "Hallo, ich bin umgezogen und möchte meine Adresse ändern lassen. Erika Beispiel, IBAN AT48 3200 0000 1234 5864, erika.beispiel@example.com" },
  gebuehr: { titel: "Beschwerde über Gebühr", text: "Ich habe eine Kontoführungsgebühr bezahlt, die ich nicht nachvollziehen kann. Bitte um Prüfung. Paul Test, IBAN AT02 2011 1000 0123 4567, paul.test@example" }
};
const CATS = ["Kartensperre", "Adressänderung", "Beschwerde", "Kreditanfrage", "Sonstiges"];

function ibanValid(iban) {
  const s = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^AT\d{18}$/.test(s)) return false;
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => (c.charCodeAt(0) - 55).toString());
  let m = 0; for (const d of r) m = (m * 10 + Number(d)) % 97;
  return m === 1;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt." });
  if (tooMany(req, 20)) return res.status(429).json({ error: "Zu viele Demo-Läufe. Bitte später noch einmal versuchen." });
  const { action, scenario, ticketId, decision } = req.body || {};

  if (action === "approve") {
    if (!/^VB-DEMO-[A-Z0-9]{6}$/.test(ticketId || "")) return res.status(400).json({ error: "Ungültige Ticket-Nummer." });
    const ok = decision === "approve";
    return res.status(200).json({ steps: [
      { step: "Menschliche Freigabe", detail: ok ? "freigegeben" : "abgelehnt", kind: ok ? "ok" : "block" },
      { step: "Workflow abgeschlossen", detail: ok ? `Ticket ${ticketId} an die Fachabteilung übergeben` : `Ticket ${ticketId} zurückgestellt`, kind: "ok" }
    ] });
  }

  const sc = SCENARIOS[scenario];
  if (action !== "start" || !sc) return res.status(400).json({ error: "Unbekanntes Szenario." });
  const steps = []; const t0 = Date.now();
  const add = (step, detail, kind = "ok") => steps.push({ step, detail, kind, ms: Date.now() - t0 });
  try {
    add("Anfrage eingegangen", `„${sc.titel}“ (fiktive Daten)`);
    const ibanMatch = sc.text.match(/AT\d{2}(?:\s?\d{4}){4}/);
    const mailMatch = sc.text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*/);
    const masked = sc.text.replace(ibanMatch ? ibanMatch[0] : "§", "[IBAN]").replace(mailMatch ? mailMatch[0] : "§", "[E-MAIL]");
    add("Pseudonymisierung", "IBAN und E-Mail vor der KI-Verarbeitung maskiert", "privacy");

    const data = await claude({ max_tokens: 200, system: "Du klassifizierst Kundenanfragen einer Bank. Antworte NUR mit JSON: {\"kategorie\": eine von " + JSON.stringify(CATS) + ", \"prioritaet\": \"hoch\"|\"mittel\"|\"niedrig\", \"begruendung\": max. 12 Wörter}", messages: [{ role: "user", content: masked }] });
    const raw = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("").replace(/```json|```/g, "").trim();
    let cls; try { cls = JSON.parse(raw); } catch { cls = null; }
    if (!cls || !CATS.includes(cls.kategorie)) { add("KI-Klassifizierung", "Ergebnis nicht eindeutig, an Menschen übergeben", "block"); cls = { kategorie: "Sonstiges", prioritaet: "mittel", begruendung: "manuelle Prüfung" }; }
    else add("KI-Klassifizierung", `${cls.kategorie} · Priorität ${cls.prioritaet} · ${cls.begruendung}`, "api");

    const ibanOk = ibanMatch ? ibanValid(ibanMatch[0]) : false;
    const mailOk = mailMatch ? /^[\w.+-]+@[\w-]+\.[a-z]{2,}$/i.test(mailMatch[0]) : false;
    add("Datenvalidierung", `IBAN-Prüfziffer ${ibanOk ? "gültig" : "ungültig"} · E-Mail ${mailOk ? "gültig" : "ungültig"}`, ibanOk && mailOk ? "ok" : "block");

    const r = await fetch(`https://${req.headers.host}/api/mock`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kategorie: cls.kategorie, prioritaet: cls.prioritaet, referenz: "[IBAN]" }) });
    const mock = await r.json();
    if (!r.ok) { add("REST-Aufruf Kernbanksystem (Mock)", `Fehler ${r.status}`, "block"); return res.status(200).json({ steps }); }
    add("REST-Aufruf Kernbanksystem (Mock)", `POST /api/mock → ${r.status} · Ticket ${mock.ticketId}`, "api");
    add("Menschliche Freigabe", "wartet auf Entscheidung", "wait");
    return res.status(200).json({ steps, ticketId: mock.ticketId, needsReview: !(ibanOk && mailOk) });
  } catch (e) {
    add("Fehler", "Die KI ist gerade nicht erreichbar", "block");
    return res.status(502).json({ steps, error: "Demo gerade nicht verfügbar." });
  }
}
