# Beyond the CV – Liv Wohralik

Ein KI-Agent, der mich als Bewerberin vorstellt und dabei zeigt, wie ich KI-Systeme baue: mit einer serverseitigen Freigabeliste, Tool Use, einer Automations-Demo mit echtem REST-Aufruf und Datenschutz als Teil der Architektur.

## Aufbau
- `index.html` – Seite mit Chat, Trust Center, Automations-Demo und Architektur
- `api/chat.js` – KI-Agent (Claude API, Tools `get_section` und `check_private_data`), liefert ein echtes Ablaufprotokoll
- `api/demo.js` – Automations-Demo: Pseudonymisierung, KI-Klassifizierung, Datenvalidierung (IBAN-Prüfziffer), REST-Aufruf, menschliche Freigabe
- `api/mock.js` – Mock eines Kernbanksystems (REST)
- `api/_lib/profile.js` – Freigabeliste: nur öffentliche Profildaten; private Daten sind nicht enthalten

## Datenschutz und Sicherheit
- API-Schlüssel nur als Umgebungsvariable `ANTHROPIC_API_KEY` bei Vercel
- Keine Speicherung von Chats, keine Cookies, kein Tracking, keine externen Schriften oder Skripte
- Begrenzungen: 500 Zeichen pro Frage, 30 Fragen bzw. 20 Demo-Läufe pro Stunde und IP
- Alle Demo-Daten sind fiktiv

