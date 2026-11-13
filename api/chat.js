// POST /api/chat – KI-Agent mit Privacy Guard (serverseitige Freigabeliste) und echtem Ablaufprotokoll.
// Chat-Inhalte werden nicht gespeichert und nicht protokolliert.
import { PUBLIC_PROFILE, PRIVATE_CATEGORIES } from "./_lib/profile.js";
import { tooMany, claude, MODEL } from "./_lib/guard.js";

const RULES = `Du bist der KI-Agent auf der Bewerbungsseite „Beyond the CV“ von Liv Wohralik. Besucher sind vor allem Recruiter und Hiring Manager.
Regeln:
- Sprich über Liv in der dritten Person, freundlich, sachlich und konkret, in der Sie-Form.
- Antworte in der Sprache der Frage (Deutsch oder Englisch), höchstens 130 Wörter, gern mit kurzen Aufzählungen.
- Lies vor jeder inhaltlichen Antwort mit get_section die passenden freigegebenen Abschnitte. Nutze ausschließlich diese Informationen. Erfinde keine Fähigkeiten, Projekte oder Erfahrungen.
- Fragt jemand nach privaten Daten (Telefonnummer, Adresse, Geburtsdatum, Gehalt, Privatleben, Interna von Arbeitgebern), rufe check_private_data auf und erkläre danach freundlich, dass diese Daten bewusst nicht im System liegen.
- Steht etwas nicht in den Abschnitten, antworte: „Dazu liegen mir keine verifizierten Informationen vor. Diese Frage stellen Sie am besten direkt im Gespräch mit Liv.“
- Allgemeine Fragen, die nichts mit Livs Profil zu tun haben, beantwortest du nicht.`;

const SECTIONS = Object.keys(PUBLIC_PROFILE);
const TOOLS = [
  { name: "get_section",
    description: "Liest einen freigegebenen (PUBLIC) Abschnitt aus Livs Profil. Verfügbar: " + SECTIONS.map(s => `${s} (${PUBLIC_PROFILE[s].label})`).join(", "),
    input_schema: { type: "object", properties: { section: { type: "string", enum: SECTIONS } }, required: ["section"] } },
  { name: "check_private_data",
    description: "Prüft, ob eine private Datenkategorie verfügbar ist. Aufrufen, wenn nach privaten Daten gefragt wird.",
    input_schema: { type: "object", properties: { category: { type: "string", enum: Object.keys(PRIVATE_CATEGORIES) } }, required: ["category"] } }
];

function valid(m) {
  if (!Array.isArray(m) || !m.length || m.length > 12) return false;
  return m.every((x, i) => x && typeof x.content === "string" && x.content.length > 0 &&
    x.content.length <= (x.role === "user" ? 500 : 4000) && x.role === (i % 2 === 0 ? "user" : "assistant")) && m.at(-1).role === "user";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Nur POST erlaubt." });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "Der Server ist nicht eingerichtet." });
  if (tooMany(req)) return res.status(429).json({ error: "Zu viele Anfragen. Bitte später noch einmal versuchen." });
  const t0 = Date.now();
  const trace = [];
  const log = (step, detail, kind = "ok") => trace.push({ step, detail, kind, ms: Date.now() - t0 });
  const { messages } = req.body || {};
  if (!valid(messages)) { log("Eingabe geprüft", "abgelehnt: ungültiges Format oder zu lang", "block"); return res.status(400).json({ error: "Ungültige Anfrage.", trace }); }
  log("Eingabe geprüft", "Länge und Format in Ordnung");
  log("Freigabeliste geladen", `${SECTIONS.length} öffentliche Abschnitte, keine privaten Daten`);

  const convo = messages.map(m => ({ role: m.role, content: m.content }));
  const sections = [], blocked = [];
  try {
    for (let round = 1; round <= 4; round++) {
      const rt = Date.now();
      const data = await claude({ max_tokens: 1024, system: RULES, tools: TOOLS, messages: convo });
      log("Anfrage an Claude API", `Runde ${round} · ${Date.now() - rt} ms`, "api");
      const blocks = Array.isArray(data.content) ? data.content : [];
      const uses = blocks.filter(b => b.type === "tool_use");
      if (!uses.length) {
        const text = blocks.filter(b => b.type === "text").map(b => b.text).join("\n").trim()
          || "Dazu kann ich gerade nichts sagen. Bitte formulieren Sie die Frage anders.";
        log("Antwort erzeugt", sections.length ? "nur aus freigegebenen Abschnitten" : "ohne Profilabschnitte");
        log("Speicherung", "Chatverlauf wird nicht gespeichert", "privacy");
        return res.status(200).json({ answer: text, trace, sections, blocked, model: MODEL });
      }
      convo.push({ role: "assistant", content: blocks });
      const results = uses.map(b => {
        if (b.name === "get_section") {
          const s = b.input && b.input.section;
          const sec = PUBLIC_PROFILE[s];
          if (!sec) { log("Privacy Guard", `Abschnitt „${s}“ nicht freigegeben`, "block"); return { type: "tool_result", tool_use_id: b.id, content: "Nicht freigegeben." }; }
          if (!sections.includes(sec.label)) sections.push(sec.label);
          log("Abschnitt gelesen", `${sec.label} · PUBLIC`, "data");
          return { type: "tool_result", tool_use_id: b.id, content: sec.text };
        }
        if (b.name === "check_private_data") {
          const c = PRIVATE_CATEGORIES[b.input && b.input.category] || "Private Daten";
          if (!blocked.includes(c)) blocked.push(c);
          log("Privacy Guard", `${c} angefragt · PRIVATE · nicht im System`, "block");
          return { type: "tool_result", tool_use_id: b.id, content: `${c} ist als PRIVATE eingestuft und liegt nicht auf diesem Server. Es gibt keinen Zugriff darauf.` };
        }
        return { type: "tool_result", tool_use_id: b.id, content: "Unbekanntes Tool." };
      });
      convo.push({ role: "user", content: results });
    }
    log("Antwort erzeugt", "Abbruch nach maximal 4 Runden");
    return res.status(200).json({ answer: "Dazu kann ich gerade nichts sagen. Bitte formulieren Sie die Frage anders.", trace, sections, blocked, model: MODEL });
  } catch (e) {
    log("Fehler", "Die KI ist gerade nicht erreichbar", "block");
    return res.status(502).json({ error: "Die KI ist gerade nicht erreichbar.", trace });
  }
}
