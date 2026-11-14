/** Spot the Scam deck. Patterns are real; companies, senders and links are fictional. */
export type DeckCard = {
  id: string;
  from: string;
  channel: "WhatsApp" | "Telegram" | "SMS" | "X" | "News app" | "Email";
  text: string;
  answer: "scam" | "legit";
  why: string;
  tells: string[];
};

export const DECK: DeckCard[] = [
  { id: "d1", from: "+91 9•••• ••210", channel: "WhatsApp", text: "🔥 Guaranteed 40% return in 30 days. SEBI registered. Only 20 seats left in VIP group. Pay ₹4,999 to wealthguru@ybl", answer: "scam", why: "Guaranteed returns, a payment to a personal UPI id and fake scarcity. Registered analysts are barred from promising returns.", tells: ["Guaranteed returns", "Personal UPI", "Fake scarcity"] },
  { id: "d2", from: "NSE · corporate filings", channel: "News app", text: "Meridian Ports & Logistics declares an interim dividend of ₹7 per share. Record date 20 November 2026.", answer: "legit", why: "A routine Reg 30 disclosure with a specific record date, published on the exchange. You can open the filing and check.", tells: ["Exchange source", "Specific, checkable details"] },
  { id: "d3", from: "Zerodha Premium Support", channel: "SMS", text: "Your account will be blocked today. Update KYC now: zerodha-kyc-update.in/login", answer: "scam", why: "A look-alike domain and a deadline. Brokers don't send KYC links on random domains.", tells: ["Look-alike domain", "Threat + deadline"] },
  { id: "d4", from: "Market Wizard 💎", channel: "Telegram", text: "Surya Fincap: operator entry done ✅ Upper circuit pakka next 3 days. Target 95. Don't share outside group 🤫", answer: "scam", why: "“Operator” talk, a price target and secrecy on a small surveillance-listed stock: the anatomy of a pump.", tells: ["Operator news", "Price target", "Secrecy"] },
  { id: "d5", from: "Business daily", channel: "News app", text: "Kaveri Power Systems receives a ₹420 crore substation order from a state utility, according to an exchange filing.", answer: "legit", why: "Names its source (an exchange filing), and the amount matches the filing.", tells: ["Named source", "Amount matches filing"] },
  { id: "d6", from: "+91 7•••• ••093", channel: "WhatsApp", text: "Download the new SEBI-approved trading app for 5% daily profit 👉 bit.ly/sebi-app5", answer: "scam", why: "SEBI never approves apps or tips, 5% a day is impossible, and the shortened link hides the destination.", tells: ["Fake authority", "Impossible return", "Hidden link"] },
  { id: "d7", from: "CDSL", channel: "Email", text: "Your consolidated account statement for October 2026 is attached. Password: your PAN in capital letters.", answer: "legit", why: "Depositories really do email monthly CAS statements protected by your PAN. ORO's Room reads exactly this file, in memory.", tells: ["Expected monthly mail", "No link, no payment"] },
  { id: "d8", from: "Rakesh Sir (Official) ✔️", channel: "X", text: "As seen on CNBC: my AI bot made ₹2 crore last month. Join free masterclass, limited seats. t.me/+richbot", answer: "scam", why: "A borrowed TV endorsement, a too-good result and a private group invite. Celebrity endorsements in such posts are routinely faked.", tells: ["Fake endorsement", "Private group"] },
  { id: "d9", from: "Nirmal Biotech · BSE", channel: "News app", text: "Promoter Nirmal Holdings creates a pledge on 31.2% of share capital, up from 12.0%.", answer: "legit", why: "A real (if worrying) SAST disclosure. Legit doesn't mean good news. It means the claim is true.", tells: ["Exchange filing", "True ≠ good"] },
  { id: "d10", from: "Investor Helpdesk", channel: "WhatsApp", text: "IPO allotment confirmed for you ✅ Pay ₹15,000 balance to grey-market agent to receive shares.", answer: "scam", why: "IPO allotments are done by the registrar through your bank's ASBA block. Nobody collects a 'balance' over WhatsApp.", tells: ["Unexpected payment", "Fake process"] },
  { id: "d11", from: "Himgiri Cements · NSE", channel: "News app", text: "Board recommends a 1:1 bonus issue, subject to shareholder approval.", answer: "legit", why: "A board outcome filed with the exchange, with the condition stated plainly.", tells: ["Exchange filing", "Conditions stated"] },
  { id: "d12", from: "Smart Trader Hub", channel: "Telegram", text: "Nirmal Biotech multibagger 🚀🚀 10x in 6 months. Insider news, buy before 3 pm today!", answer: "scam", why: "Multibagger hype, a 10× promise, insider claims and a 3 pm deadline on a thinly traded SME stock.", tells: ["Hype", "Insider claim", "Deadline"] },
  { id: "d13", from: "Tarang Telecom · NSE", channel: "News app", text: "Q2 net loss at ₹212 crore versus ₹305 crore a year ago.", answer: "legit", why: "Quarterly results with year-on-year comparison, straight from the filing.", tells: ["Exchange filing", "Specific numbers"] },
  { id: "d14", from: "+91 8•••• ••771", channel: "WhatsApp", text: "Hi, I'm a SEBI officer. Your demat is under investigation. Pay ₹25,000 security deposit to avoid freeze.", answer: "scam", why: "Regulators don't call or WhatsApp individuals asking for payments. Impersonating officials is a common extortion pattern.", tells: ["Fake official", "Threat", "Payment demand"] },
  { id: "d15", from: "Anvay Equity Research · INH000017002", channel: "Email", text: "Our research note on the cement sector is published. Disclosures and risk factors on page 14. No returns are assured.", answer: "legit", why: "Shows a registration number you can check, publishes disclosures and makes no promises.", tells: ["Checkable registration", "Disclosures"] },
  { id: "d16", from: "Mutual Fund Desk", channel: "SMS", text: "Switch your SIP to our 'Fixed Income Plus' scheme: 18% assured yearly. Reply YES.", answer: "scam", why: "Mutual funds can't assure returns. 18% 'assured' is the giveaway.", tells: ["Assured returns", "Pressure to act"] },
];

export const LANDING_DECK = ["d1", "d2", "d4", "d7", "d6"];
