# Lumen — έλεγχος έξυπνου φωτισμού

PWA (React + TypeScript + Tailwind) για ενιαίο έλεγχο λαμπών Tapo (και Yeelight/Xiaomi στο επόμενο βήμα).

## Αρχιτεκτονική

```
iPhone (PWA, Safari) ──HTTPS──▶ Vercel Functions (/api, προστατευμένα με κωδικό)
                                  ├─▶ SmartThings API ──▶ Tapo cloud ──▶ λάμπες Tapo
                                  └─▶ (επόμενο) Xiaomi cloud ──▶ Yeelight
Upstash Redis: κρυπτογραφημένα tokens, σκηνές, ομάδες, αγαπημένα χρώματα
```

* Ο browser δεν μπορεί να μιλήσει απευθείας με λάμπες (raw TCP/UDP στο LAN), οπότε ο έλεγχος γίνεται μέσω cloud.
* Κοινό abstraction layer: `api/_lib/providers/` — κάθε κατασκευαστής υλοποιεί το `LightProvider`.
* Το SmartThings επιτρέπει ~10 εντολές/λεπτό ανά συσκευή· το `src/lib/scheduler.ts` κάνει προσαρμοστικό throttling.
* Τα tokens δεν φτάνουν ποτέ στον browser· αποθηκεύονται κρυπτογραφημένα (AES-256-GCM).

## Μεταβλητές περιβάλλοντος (Vercel)

| Όνομα | Περιγραφή |
|---|---|
| `APP_PASSWORD` | Κωδικός εισόδου στην εφαρμογή |
| `SESSION_SECRET` | Τυχαίο μυστικό ≥ 32 χαρακτήρων |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis (αυτόματα από Vercel Marketplace) |
| `CRON_SECRET` | Για το καθημερινό cron ανανέωσης token |

## Τοπική ανάπτυξη

```
npm install
npm run dev:api   # API στο :3001 (διαβάζει .env.local, αποθήκευση σε .data/)
npm run dev       # Vite στο :5173
```
