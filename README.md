# DeskTap

Tap your iPhone on an NFC tag on your desk to start a focus timer or log a LeetCode problem. A dashboard shows your streak, daily problems, focus time, and a paste-ready weekly update.

No server, no account, no app-store build. It's a static web app; data lives in your phone's browser.

## How it works

Each tag holds a normal web link:

| Tag | Link | What happens |
|---|---|---|
| Focus | `…/#/t/focus` | Starts a 25 min timer. Tap again to stop and log it. |
| LeetCode | `…/#/t/leetcode` | Opens the quick log form (name, difficulty, solved/stuck, minutes). |
| Break | `…/#/t/break` | Starts a 5 min break. Tapping it during focus logs the focus first. |

iPhone XS and newer read tags in the background: tap, then tap the banner that appears.

Details that are handled on purpose:
- Timers store a start timestamp, so they stay correct when the screen locks or Safari is suspended.
- The URL is rewritten after a tag tap, so refreshing can't toggle the timer a second time.
- A second read of the same tag within 4 s is ignored (iOS sometimes opens a link twice).
- Anything under a minute is treated as an accidental tap and isn't logged.
- Only **Solved** problems count toward the streak. Today having no problem yet doesn't break it until the day ends.

## Run it on your Mac

```bash
npm install
npm test        # unit tests for streaks, timers, summaries
npm run dev     # http://localhost:5173
npm run build   # production build in dist/
```

## Deploy free on GitHub Pages (needed before tags work)

Tags must point at a public HTTPS address, not `localhost`.

```bash
git init && git add . && git commit -m "DeskTap"
git branch -M main
git remote add origin https://github.com/<you>/desktap.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Source: GitHub Actions**. The included workflow runs the tests, builds, and publishes. Your app will be at `https://<you>.github.io/desktap/`.

## Write the tags (iPhone, free)

1. Open your deployed app, go to **Tags**, and check the address shown is your GitHub Pages URL.
2. Install **NFC Tools**. Write → Add a record → URL/URI → paste a link from the Tags page → Write → hold the top of the iPhone to the tag.
3. Test by tapping the tag with the screen on.
4. When happy, lock the tag (NFC Tools → Other → Lock tag). Locking is permanent.

No tags yet? The QR codes on the Tags page open the same links, so you can use the whole app today.

## Good to know

- **Use it in Safari, not as a home-screen app.** iPhone keeps separate storage for each, and tags open in Safari, so your logs would split.
- Safari can erase site data after weeks of not visiting. Use **Back up data** now and then (and **Restore** on a new phone).
- Data is per browser. Your Mac and iPhone each have their own history unless you restore a backup.
- Tag links are ordinary public URLs. Anyone who scans one just opens your app, with their own empty data. Nothing of yours is exposed.
- NTAG213 stickers (about £5 for 10) are plenty: these links are well under their 144 byte limit. Keep tags off metal surfaces, or use anti-metal tags or a spacer.

## Project layout

```
src/store.ts   state, localStorage, tag toggle logic
src/stats.ts   streaks, day buckets, weekly summary (pure functions)
src/main.ts    views, routing, events, charts
tests/         unit tests (npm test)
```

## Ideas for next

- Sync between devices (small server or Supabase)
- Pull LeetCode stats automatically
- A "Gym" or "Reading" tag, same pattern
- Shortcuts automation: an iPhone Shortcut that also turns on Focus mode when you tap the Focus tag
