# Gruppetto

**Live preview (demo data):** https://nikolaskorakidis.github.io/gruppetto/

A cycling-club ride planner for iOS, Android and the web, built from one codebase.

Clubs plan rides. Members sign up as **going / maybe / can't**, pick a pace group, chat about the ride, download the GPX, and check the forecast. Admins manage members, roles, invites and news.

- **App:** Expo SDK 57 · React Native 0.86 · Expo Router · TypeScript · TanStack Query · Plus Jakarta Sans
- **Backend:** Supabase (Postgres + Row Level Security, Auth, Storage, Realtime, Edge Functions)
- **Maps:** MapLibre GL with OpenFreeMap tiles (free, no API key) in a WebView on phones and an iframe on the web
- **Weather:** Open-Meteo (free, no key)

---

## Demo mode (no backend needed)

The app ships with a built-in demo: fictional clubs, riders, routes, rides, chats and news, plus working flows (sign up with a code, join a club, sign up for rides, chat, plan and cancel rides, manage members). Everything runs inside the app and is saved on the device, so it's perfect for showing the app before Supabase is connected.

- Demo mode is **on automatically when no Supabase keys are set**, or force it with `EXPO_PUBLIC_DEMO=1`.
- On the sign-in screen, tap **Try it as Jordan** to explore as a sample club owner, or create your own account (any 6-digit code confirms it).
- Invite code for the sample club: **RIDE2026**.
- **More → Demo mode → Reset** puts all sample data back.
- Maps and weather are live (OpenFreeMap and Open-Meteo); everything else is local.

```bash
npm run demo
```

---

## Features

| Area | What you get |
|---|---|
| **Accounts** | Email + password sign-up with **email confirmation**. The email has both a link and a 6-digit code, so it works even when you open the email on a different device than your phone. Also: password reset, change password, delete account (GDPR). |
| **Clubs** | Belong to several clubs and switch between them from the header. Create a club, or join with an invite code, link or QR code. Optional admin approval for new members. Roles: owner, admin, ride leader, member. |
| **Rides** | Home screen with your next ride and a live countdown, a two-week day strip, and cards with a route sketch, stats and one-tap Join. Filters for past rides, ride type and open rides from other clubs. |
| **Planning a ride** | Upload a GPX or pick one from the library, and distance and climbing fill in automatically. Estimated duration is worked out from distance and speed. Also: saved start locations, coffee stop, **pace groups** (A/B/C), ride leaders, rider limit, allowing "maybe", public or club-only, posting as the club, and signing yourself up. Rides can be edited, cancelled with a reason, reactivated, copied for next week, or shared. |
| **Ride page** | Route map, directions to the start, **forecast for the start hour** (temperature, wind in Beaufort with direction, rain chance) and a **fuel plan** (carbs and fluid per hour). Riders tab grouped by pace group, plus a live chat. |
| **Routes** | Club GPX library with search, favourites and distance filters. Download a route or send it to Garmin Connect, Wahoo or Komoot through the share sheet. You can start a ride from any route. |
| **News** | Admins post announcements (which can be pinned) and members get notified. |
| **Notifications** | In-app inbox (updates live) and push notifications on phones. Each person picks which ones they want: new rides, changes/cancellations, chat, news. |
| **Calendar** | A private iCal feed (`webcal://`) for Apple, Google or Outlook calendars. It shows your status (✓ / ?) and updates when rides change or get cancelled. |
| **Privacy** | Emergency contact and phone number are stored separately and visible only to you and your club admins. |

### Security model (enforced in the database)

- **Row Level Security** is on for every table. Anonymous users get nothing.
- **Club isolation:** members of club A can never read club B's members, news or rides, unless a ride is public.
- **Approval:** a pending member sees nothing from the club until an admin approves them.
- **Groups lock** once anyone has signed up. **Rider limits** use row locking, so two people can't grab the last spot at the same time.
- **Roles:** only an owner can create admins. The last owner can't leave the club.
- **Notifications** are written only by database triggers.
- **GPX files** sit in a private storage bucket that only club members can read.

`npm run test:db` runs **32 scenario tests** against a real Postgres (PGlite) to prove these rules hold.

---

## Supabase setup (one time, ~15 minutes)

### 1. Create the project
1. Go to [supabase.com](https://supabase.com) → **New project**. Pick an EU region (e.g. Frankfurt).
2. Open **Project Settings → API** and copy the **Project URL** and the **publishable key** (`sb_publishable_…`, or the legacy `anon` key).

### 2. Create the database
Pick **one** option:

- **Option A: SQL editor (easiest).** Open **SQL Editor** → New query, paste the whole of `supabase/migrations/20261014000000_init.sql`, and click **Run**.
- **Option B: Supabase CLI.**
  ```bash
  npx supabase login
  ```
  ```bash
  npx supabase link --project-ref YOUR-PROJECT-REF
  ```
  ```bash
  npx supabase db push
  ```

This creates the tables, security policies, triggers, storage buckets (`gpx`, `avatars`, `club-logos`) and Realtime setup.

### 3. Turn on email confirmation
**Authentication → Sign In / Providers → Email:**
- ✅ Enable email provider
- ✅ **Confirm email**
- ✅ Secure email change
- Minimum password length: **8**

**Authentication → URL Configuration:**
- **Site URL:** your web app URL (e.g. `https://gruppetto.vercel.app`). Before you deploy, use `http://localhost:8081`.
- **Redirect URLs:** add all of these:
  ```
  gruppetto://**
  exp://**
  http://localhost:8081/**
  https://YOUR-WEB-DOMAIN/**
  ```

**Authentication → Email Templates:** copy in the HTML from `supabase/templates/`:
- *Confirm signup* ← `confirmation.html` (subject: "Confirm your Gruppetto account")
- *Reset password* ← `recovery.html`
- *Change email address* ← `email_change.html`

The templates include `{{ .Token }}`, so people get the 6-digit code as well as the link.

### 4. Use a real email sender (important)
Supabase's built-in email only sends a few emails per hour and is meant for testing. For real use, set up custom SMTP under **Project Settings → Authentication → SMTP Settings**. [Resend](https://resend.com), Postmark, Brevo and Amazon SES all work. Verify your sending domain (SPF/DKIM) so emails don't land in spam.

### 5. Deploy the Edge Functions
```bash
npx supabase functions deploy send-push --no-verify-jwt
```
```bash
npx supabase functions deploy calendar --no-verify-jwt
```
```bash
npx supabase functions deploy delete-account --no-verify-jwt
```
(Each one handles its own authentication: a webhook secret, the calendar token, or the user's login token.)

Set the secrets:
```bash
npx supabase secrets set PUSH_WEBHOOK_SECRET=$(openssl rand -hex 24) APP_URL=https://YOUR-WEB-DOMAIN
```
Optional: add `EXPO_ACCESS_TOKEN=…` if you turn on "enhanced push security" in Expo.

### 6. Connect push notifications to the database
**Database → Webhooks → Create a new hook:**
- Table: `public.notifications` · Events: **Insert**
- Type: **Supabase Edge Function** → `send-push`
- HTTP header: `x-webhook-secret` = the `PUSH_WEBHOOK_SECRET` you set in step 5

### 7. Configure the app
```bash
cp .env.example .env
```
Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. **Never** put the secret or service_role key in the app.

---

## Running it

```bash
npm install
```
```bash
npx expo start
```
Press **w** for web, **i** for the iOS simulator, **a** for Android, or scan the QR code with **Expo Go**.

**Expo Go vs. a development build:** everything works in Expo Go except **push notifications**, which need a development build:
```bash
npx eas-cli@latest init
```
```bash
npx eas-cli@latest build --profile development --platform ios
```
`eas init` writes your `projectId` into `app.json`; push registration needs it. For Android push you also need FCM credentials (`npx eas-cli@latest credentials`).

### First run
1. Sign up. Enter the code from the email, or tap its link.
2. Set your name and photo, then **Create a club**.
3. Open **Club → Manage club & invite riders** and share the QR code, link or code with your riding mates.

### Preview link (GitHub Pages)
Every push to `main` builds the web app in demo mode and publishes it to GitHub Pages (`.github/workflows/deploy-preview.yml`). The workflow also runs the typecheck and tests first.

### Deploying the web app
```bash
npm run build:web
```
This builds the web app into `dist/`. `vercel.json` (Vercel) and `public/_redirects` (Netlify) are already set up to send every page to the app. Then set `EXPO_PUBLIC_APP_URL` in `.env` so invite links and calendar events point to your domain.

### Publishing to the stores
```bash
npx eas-cli@latest build --profile production --platform all
```
```bash
npx eas-cli@latest submit --platform ios
```
Before you publish, change `ios.bundleIdentifier` and `android.package` in `app.json` (currently `app.gruppetto`) to an ID you own.

---

## Checks

```bash
npm run typecheck
```
```bash
npm run lint
```
```bash
npm test
```
`npm test` runs the GPX parser unit tests and the 32 database security tests against an in-memory Postgres. No Docker needed.

---

## Project layout

```
src/
  app/                     Expo Router screens (one file = one route)
    (auth)/                sign-in, sign-up, verify (code), forgot-password
    (tabs)/                index (rides), news, routes, club, more
    auth/confirm.tsx       landing page for email links (all platforms)
    ride/[id].tsx          ride detail: details / riders / chat
    ride/new.tsx           plan, edit (?id=) or copy (?copy=) a ride
    route/, news/, club/   library, news, join/create/manage club
    onboarding.tsx         profile + first club
  components/              design system (ui.tsx, theme.ts), RideCard, RsvpControl, RouteMap …
  hooks/data.ts            all queries & mutations (TanStack Query + Realtime)
  lib/                     supabase client, GPX parser, weather, fuel plan, files, push
  demo/                    built-in demo backend (seed data + in-app API)
  providers/               AuthProvider (session, recovery mode), ClubProvider (active club)
supabase/
  migrations/              schema, RLS, triggers, storage
  functions/               send-push, calendar (iCal), delete-account
  templates/               branded auth emails (link + code)
  tests/rls.test.mjs       security tests on PGlite
tests/gpx.test.mjs         GPX parser tests
```

## Ideas for the next version
- Strava OAuth: import routes, and check attendance against recorded rides for club rankings and challenges
- Paid tickets and digital waivers for events (Stripe or Mollie for iDEAL)
- Share-to-app: open a `.gpx` from Komoot or Garmin straight into "Plan a ride"
- Dutch translation (`expo-localization` + i18n)
- Club ranking from attendance, a photo album per ride, a member marketplace
