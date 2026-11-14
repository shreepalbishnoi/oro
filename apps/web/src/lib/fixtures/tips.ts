/** Sample tips (fictional companies and senders) used in the hero, the Noise chapter and Forward Trail seeds. */

export const SAMPLE_TIPS = [
  {
    id: "kaveri",
    label: "“₹4,200 cr order”",
    text: `Forwarded many times
🚀🚀 KAVERI POWER ko ₹4,200 crore ka order mila hai, kal announcement hoga!
Operator news hai, kisi ko mat batana. Target 180, SL 120.
VIP group join karo sirf ₹999 mein: pay to profitking@ybl
100% sure shot, aaj hi lo 🔥`,
  },
  {
    id: "surya",
    label: "“Merger with foreign bank”",
    text: `BIG NEWS: Surya Fincap merging with a foreign bank, sources say deal is done. Stock can give 300% returns in 2 months. SEBI registered advisor. Only today entry. Join https://t.me/+SuryaVIPcalls`,
  },
  {
    id: "meridian",
    label: "“Meridian dividend”",
    text: `Meridian Ports & Logistics announced an interim dividend of Rs 7 per share, record date 20 November, as per its NSE filing. It also filed to acquire Coastline Terminals for Rs 1,350 crore.`,
  },
  {
    id: "app",
    label: "“New trading app”",
    text: `Zerodha new VIP app launched for premium clients 🎁 Guaranteed 5% daily profit. Download now: https://zerodha-premium.in/app.apk SEBI approved scheme. Limited seats.`,
  },
] as const;

export const NOISE_LINES = [
  "🚀 100% sure shot, aaj hi lo",
  "Operator news hai, kisi ko mat batana",
  "Target 180 · SL 120",
  "VIP group sirf ₹999 mein",
  "Upper circuit pakka 🔥",
  "Merger done, sources say",
  "SEBI approved scheme",
  "Paisa double in 30 din",
  "Forwarded many times",
  "Only today entry ⏳",
  "Insider tip, don't share",
  "Multibagger alert 💎",
  "Guaranteed 5% daily",
  "Join t.me/+VIPcalls",
  "Big order coming kal",
  "Free tips, 0 loss",
  "₹4,200 cr ka order mila",
  "Bonus 5:1 announce hoga",
];

export const TRAIL_SEEDS = [
  { text: SAMPLE_TIPS[0].text, count: 214, variants: 9, daysAgo: 3, channels: ["WhatsApp", "Telegram"] },
  { text: SAMPLE_TIPS[1].text, count: 87, variants: 4, daysAgo: 5, channels: ["Telegram", "X"] },
  { text: SAMPLE_TIPS[3].text, count: 1312, variants: 31, daysAgo: 11, channels: ["WhatsApp", "SMS", "Telegram"] },
];
