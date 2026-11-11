# Oral Health Data Form

A mobile-first web app for collecting the **Oral Health Practice Questionnaire (Annexure IV)** and the
**clinical oral examination (Annexure II)** in the field, with an admin area to view and export the data.

- **Form** – `/` – free to use, no login. Bilingual (English + বাংলা), one step at a time, large tap targets.
- **Admin** – `/admin` – single admin login, list / search / filter, record detail, delete, **CSV export**.
- **Built for weak connections** – works fully offline after the first visit, autosaves every answer, and
  uploads finished forms automatically when the internet comes back.

Built with Next.js 16 (App Router), React 19, Tailwind CSS 4 and MongoDB.

---

## How the form works

| Step | Contents |
| --- | --- |
| 1. Consent | *Consent Taken* Yes / No. **No** → only the Participant ID is saved, as a refusal record. |
| 2. Participant information | Q1 Participant ID, Q2 Age, Q3 Gender, Q4 Marital Status, Q5 Education, Q6 Occupation |
| 3. Residence & income | Q7 Years in this area, Q8 Average family income, Q9 House type |
| 4. Teeth cleaning habits | Q10 Brush teeth?, Q11 When (multiple, only if Q10 = Yes), Q12 Cleaning method, Q13 Adverse habits (multiple; "No" excludes the others) |
| 5. Dental visits & awareness | Q14 Dentist visits, Q15 Aware of dental diseases?, Q16 Source (only if Q15 = Yes) |
| 6. Clinical exam (Annexure II) | 1 DMFT (decayed / missing / filled teeth counts, or "d. No"), 2 CPI |
| 7. Clinical exam (Annexure II) | 3 Plaque Index, 4 Functional Status, 5 Other oral condition, Saliva (+ OHSI reference text) |
| 8. Review & submit | Every answer on one screen with **Edit** buttons |

Details for collectors:

- Every question shows the option numbers / scores from the paper form.
- Numbers can be typed with English or Bengali digits (`৪৫` → 45).
- Each step is checked before moving on (e.g. years lived in the area cannot exceed age; D+M+F ≤ 32).
- The progress bar is tappable to jump back to earlier steps.
- A warning appears if the same Participant ID was already saved on that device.
- The OHSI total is **not** calculated – the raw values are stored, and the reference text is shown.

### Offline and bad-connection behaviour

1. **First visit online** → a service worker (`public/sw.js`) caches the form. After that the page opens even
   with no connection at all ("Add to Home screen" installs it like an app).
2. **Every answer is autosaved** on the device (localStorage). Closing the tab, a crash or a reload restores the
   form exactly where it was.
3. **Submit** writes the form to an on-device queue (IndexedDB) *first*, then tries to upload. If there is no
   connection it shows **"Saved on this device"** and the collector can carry on with the next participant.
4. Queued forms upload automatically when the connection returns (online event, every 30 s, when the app is
   reopened, and via Background Sync on Android/Chrome even after the tab is closed).
5. Uploads are **idempotent**: each form has a device-generated id, so a retry after a dropped connection never
   creates a duplicate record.
6. The status chip in the header (Online / Offline + count) opens a **This device** panel showing what is still
   waiting, what was uploaded, and a manual "Upload now" button.

> Note: browser storage is per device and per browser. Forms waiting to upload are lost if the browser's site
> data is cleared before they upload, so let the "waiting" count reach zero before clearing data or switching phones.

### Data stored in MongoDB

Collection `submissions`, one document per participant:

```jsonc
{
  "clientId": "be40ba8d-…",          // device-generated, unique
  "participantId": "P-001",
  "consent": true,
  "answers": {
    "consent": true, "participantId": "P-001", "age": 45, "gender": 2, "maritalStatus": 1,
    "education": 3, "occupation": 3, "yearsInArea": 10, "familyIncome": 125000,
    "houseType": 5, "houseTypeOther": "Rented flat", "brushTeeth": 1, "brushTimes": [1, 3],
    "cleaningMethod": 1, "adverseHabits": [1, 3], "dentistVisit": 1, "awareDentalDiseases": 1,
    "awarenessSource": 2, "dmftDecayed": 2, "dmftMissing": 1, "dmftFilled": 0, "dmftNone": false,
    "cpi": 2, "plaque": 1, "functional": 0, "otherCondition": 0, "saliva": 0
  },
  "schemaVersion": 1,
  "startedAt": "…", "clientCreatedAt": "…", "receivedAt": "…", "userAgent": "…"
}
```

Questionnaire answers store the **option number** printed on the form (e.g. Married = 1); clinical answers store
the **score** (e.g. Calculus present = 2). Questions that were skipped (Q11 when Q10 = No, Q16 when Q15 = No) are
not stored. The CSV export has a code column and a label column for each question, and one 0/1 column per option
for the multiple-answer questions (Q11, Q13).

All question text and options live in one file: [`src/lib/form-schema.ts`](src/lib/form-schema.ts). The UI,
server-side validation, admin view and CSV export are all generated from it.

---

## Deploying (Vercel + MongoDB Atlas – both have free tiers)

### 1. Create the database

1. Create a free cluster at <https://www.mongodb.com/cloud/atlas>.
2. **Database Access** → add a database user with a password.
3. **Network Access** → add `0.0.0.0/0` (Vercel servers have no fixed IP addresses).
4. **Connect → Drivers** → copy the connection string (`mongodb+srv://…`) and put the user's password into it.

### 2. Deploy the app

1. Import this GitHub repository at <https://vercel.com/new>.
2. Add these **Environment Variables** (see [`.env.example`](.env.example)):

   | Name | Value |
   | --- | --- |
   | `MONGODB_URI` | the Atlas connection string |
   | `MONGODB_DB` | `oral_health` (optional) |
   | `ADMIN_USERNAME` | admin username |
   | `ADMIN_PASSWORD` | a long, strong password |
   | `AUTH_SECRET` | 32+ random characters, e.g. the output of `openssl rand -base64 48` |
   | `APP_TIMEZONE` | `Asia/Dhaka` (optional; used for dates in the admin area and CSV) |

3. Deploy. Share the site URL with data collectors; the admin area is at `/admin`.

Changing `ADMIN_PASSWORD` or `AUTH_SECRET` (and redeploying) signs out every admin session immediately.

Any host that runs Node.js 20.9+ works too (`npm run build && npm start`), as long as the site is served over
**HTTPS** – service workers (offline mode) only run on HTTPS or `localhost`.

---

## Local development

```bash
npm install
```

```bash
cp .env.example .env.local
```

Edit `.env.local` (a local MongoDB works: `MONGODB_URI="mongodb://127.0.0.1:27017"`), then:

```bash
npm run dev
```

The service worker is only registered in production builds. To try offline mode locally:

```bash
npm run build && npm start
```

Checks:

```bash
npm run lint && npx tsc --noEmit
```

## Project layout

```
src/
  app/
    page.tsx                     public form
    admin/login/                 admin login page
    admin/(protected)/           dashboard + record detail (session required)
    api/submissions/             public upload endpoint (validated, idempotent)
    api/admin/                   login, logout, delete, CSV export
    manifest.ts                  PWA manifest
  components/form/               form UI (steps, fields, review, device panel)
  components/admin/              admin UI pieces
  lib/form-schema.ts             all questions & options (EN + BN)
  lib/validation.ts              shared validation (browser + server)
  lib/client/                    draft autosave, upload queue, service worker registration
  lib/server/                    MongoDB, auth, rate limiting, CSV
  proxy.ts                       redirects signed-out visitors of /admin to the login page
public/sw.js                     service worker (offline cache + background upload)
```

## Security notes

- The form endpoint is public by design. It accepts only well-formed submissions (strict whitelist validation,
  32 KB limit); everything else is rejected.
- The admin session is an httpOnly, SameSite cookie holding a signed token (12 h). State-changing admin requests
  must come from the same origin. Failed logins are rate-limited (10 per 15 minutes per IP).
- Admin pages and APIs are never cached by the service worker or CDN and are marked `noindex`.
- CSV cells starting with `=`, `+`, `-`, `@` are escaped to prevent spreadsheet formula injection.
