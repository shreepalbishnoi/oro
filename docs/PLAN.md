# ORO: product plan

This is where I keep track of what ORO is, what's built, and what comes next.

## Why I'm building this

Stock tips in India travel through WhatsApp groups and Telegram channels. A lot of them are
pump-and-dump schemes, fake "SEBI registered" analysts, or real news with one number quietly
changed. The truth is usually sitting in a public filing on BSE or NSE, but almost nobody has the
time to dig it out before acting on a tip.

ORO does that digging for you, and it only ever tells you what the records say. It never tells
you what to buy or sell.

## Who it's for

- Retail investors who get tips from family groups, Telegram channels and finfluencers.
- People with a demat account and a few mutual funds who want to know when something actually
  happens to the companies their money is in.
- Families who want a simple way to check a "sure-shot" message before a parent acts on it.

## The products

| Product | The question it answers |
|---|---|
| **Parakh** | "Someone sent me this. Is it true?" Paste a tip, link or screenshot and get a Karat score (0–24), a risk band and the source line for every claim. |
| **Room** | "What happened to *my* money?" Only filings about companies you own, including the ones inside your mutual funds, sized in rupees. |
| **Ask Room** | Plain-language questions answered from filings and your own holdings, always with sources. |
| **Scam quiz and library** | Learn the common Indian stock-scam patterns by spotting them. |

## Rules I don't break

1. **No advice.** ORO never says buy, sell or hold, never gives a target price, never promises
   returns. Every sentence it writes goes through an advice filter (English, Hindi, Hinglish).
2. **Show the source or say "Unverified".** A claim is only marked true or false when ORO can quote
   the filing, and code checks the quote exists word for word.
3. **The score is public.** Karat is a published, versioned formula anyone can recompute.
4. **Privacy first.** Personal details are removed before anything is stored or sent to an AI
   model. Statements are read in memory and never saved.
5. **No live prices.** Values use the last closing price only (exchange licensing).
6. **Nobody pays for placement.** No brokerage, commissions or sponsored stories.

## What's built

| Area | Status |
|---|---|
| Parakh: scrubbing, scam rules, claim extraction, evidence search, grounded verdicts, Karat | ✅ Live |
| Live progress over Server-Sent Events, shareable verdict pages and result cards | ✅ Live |
| Screenshot reading (vision model) and safe link reading | ✅ Live |
| Filing pipeline: NSE, BSE, SEBI and news feeds, PDF text, company linking, embeddings | ✅ Live |
| Room: CAS and broker CSV import, holdings, X-ray look-through, what-if slider, news feed | ✅ Live |
| Ask Room (retrieval-augmented, cited answers) | ✅ Live |
| Accounts, consent, data export and delete | ✅ Live |
| Web Push alerts for material filings | ✅ Live |
| Dark and light themes, mobile layout | ✅ Live |
| Production hosting, HTTPS, CI and auto-deploy | ✅ Live |

## What's next

**Soon**
- Corporate-actions calendar: results, AGMs, record dates, with `.ics` export
- Red-flag timelines per company and a rumour tracker that closes when the company responds
- Full mutual-fund look-through from AMC monthly portfolio files
- An evaluation set (hand-labelled claims, scams and clean messages) with published accuracy
- Telegram bot and email alerts

**Later**
- Family view and Guardian alerts (a heads-up when a parent checks a risky tip)
- Hindi and other Indian languages
- Paid plan for heavy users (no ads, no broker money)
- Impact ranges from historical events, clearly labelled as history, not a forecast
- A verification API for newsrooms and fact-checkers

## Data sources

All public and free to access:

| Data | Source |
|---|---|
| Company announcements and results | NSE and BSE announcement feeds, filing PDFs |
| Insider trades, bulk and block deals | NSE disclosures |
| End-of-day prices, index data | NSE bhavcopy and index files |
| Mutual fund NAVs | AMFI |
| Regulator news and orders | SEBI RSS, SEBI intermediary register |
| News headlines | Economic Times and Mint market RSS (headline, own summary and link only) |

## Quality targets

| What | Target |
|---|---|
| Claim verdict accuracy (macro-F1, English + Hinglish) | ≥ 0.80 |
| Quotes found word for word in the cited source | ≥ 98% |
| Scam-detection precision | ≥ 0.90 |
| Prompt-injection success | 0 |
| A new filing reaching the right feeds | under 3 minutes |
| Feed API response (p95) | under 150 ms |

## Risks I'm watching

- **Data access.** Exchange feeds are public but not licensed for scale. Before growing, ORO moves
  to a licensed data feed.
- **AI limits.** Free AI tiers have daily caps. ORO budgets tokens per provider and still works on
  rules and records when the AI is unavailable.
- **Regulation.** SEBI's research-analyst rules and India's DPDP Act shape every feature. Anything
  close to a recommendation waits for a registered partner or licence.
