# Keisha's World 琦莎的世界

A Roblox-style Mandarin learning game for Keisha, built from her SJKC Bahasa Cina textbooks.
Runs on Cloudflare Workers, with progress saved in a Cloudflare D1 database.

## What's inside

| Part | What it does |
|---|---|
| **Power Check** | Placement test: 12 characters from each year's textbook (Standard 1–4): 4 Recognition, 6 Comprehension, 2 Application, with an "I don't know" button. Stops early when it gets too hard. Repeats every 28 days, or when Mummy asks for one. |
| **Islands** | 23 stages, one per Tahun 1 lesson (识字一 → 叶子鸟). Each stage has 15 questions over three levels. |
| **Recognition 认读** | Hear & pick (sound-alike choices) and Spot the twin (look-alike characters). Hints: Pinyin / Hear slowly / Character clue. +3 coins, −1 per hint. |
| **Comprehension 理解** | 中文 → English, English → 中文, and picture match with no English. Hints: Pinyin / Hear it / Translate. +5 coins, −3 per hint. |
| **Application 运用** | Fill the gap (textbook sentences first, then new sentences using only her words) and Read & answer. Hints: Hear sentence / Key words / Translate. +7 coins, −3 per hint. |
| **Stage mix** | 6 R + 6 C + 3 A at first; more Application as she earns Comprehension badges (up to 9). Application only uses words she has got right in Comprehension. |
| **Badges** | Per word, in order R → C → A: 2 right answers with no hints on 2 different days. All three = MASTER word. |
| **Stage gate** | 12/15 correct with 4 hints or fewer unlocks the next island. Time per stage is compared with the last try. Speed bonus +1 from Stage 7. |
| **Daily check-in** | Finishing a stage checks in for the day. Every 3 days missed in a row = −5 coins. |
| **Shop** | 3D avatar (drag to spin): hair colour and style, tops, skirts, headphones, pets with Chinese names, pet accessories. |
| **Cash out** | 100 coins = RM 1. Keisha asks, Mummy marks Paid or Not now (coins go back). All dated. |
| **Mummy's Corner** | PIN-locked: week vs last week, level vs syllabus, understanding levels (R/C/A) and the gaps between them, best hint per level, textbook vs new sentences, struggling words, mix-ups, 7-day memory, best time of day, quits, help log, cash requests, data export. |

## Files

```
public/        the app (index.html, app.js, data.js, avatar3d.js, style.css)
src/worker.js  the API + database tables (created automatically)
wrangler.toml  Cloudflare settings
```

Word lists live in `public/data.js`. Rules (coins, pass marks) are in `RULES` at the top of `public/app.js`.

## One-time Cloudflare setup

1. **Create the database:** Cloudflare dashboard → Storage & Databases → D1 → Create → name it `keisha-world-db`. Copy its **Database ID**.
2. The database ID is already set in `wrangler.toml`.
3. **Connect the repo:** Workers & Pages → Create → Import a repository → pick `keisha-world`. Keep the default build settings (deploy command `npx wrangler deploy`).
4. Open the link Cloudflare gives you (`keisha-world.<you>.workers.dev`). On Keisha's phone or tablet: browser menu → **Add to Home Screen**.
5. Tap **🔒 Mummy** in the lobby to create your PIN. Do this before Keisha plays.

After that, every change pushed to GitHub goes live by itself.

If the database isn't connected, the app still works but saves only on that device.
