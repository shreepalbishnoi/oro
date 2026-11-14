/** Scam teardowns: real patterns, invented examples. */
export type Teardown = {
  slug: string;
  title: string;
  hook: string;
  example: string;
  steps: string[];
  tells: string[];
  oroChecks: string[];
};

export const SCAMS: Teardown[] = [
  {
    slug: "telegram-pump-and-dump",
    title: "The Telegram pump-and-dump",
    hook: "A “VIP channel” pushes a small stock. Thousands buy at once. The channel's owners sell into the crowd.",
    example: "Surya Fincap: operator entry done ✅ Upper circuit pakka next 3 days. Target 95. Don't share outside group 🤫",
    steps: ["Operators quietly buy a thinly traded SME stock.", "Free channels post “sure shot” calls with targets and urgency.", "Followers pile in; price and volume spike.", "Operators sell to the followers. The price collapses."],
    tells: ["Small or SME stock", "Price target and stop-loss", "“Operator” or “insider” language", "Private group invites"],
    oroChecks: ["Surveillance lists (ASM/GSM)", "Volume vs the stock's own 60-day history", "Bulk deals and insider sales in the same window", "How many channels are pushing the same ticker"],
  },
  {
    slug: "fake-trading-app",
    title: "The fake trading app",
    hook: "A slick app shows your deposit growing 5% a day. Withdrawals never arrive.",
    example: "Download the new VIP app for premium clients. Guaranteed 5% daily profit. zerodha-premium.in/app.apk",
    steps: ["You're added to a WhatsApp “learning” group with fake members celebrating profits.", "An admin shares an app outside the Play Store.", "Small first withdrawals succeed to build trust.", "Larger deposits are frozen; “taxes” or “fees” are demanded to release them."],
    tells: [".apk links or unknown app stores", "Look-alike broker names and domains", "Impossible daily returns", "Fees to withdraw your own money"],
    oroChecks: ["Look-alike and internationalised domains", "Link shorteners and .apk downloads", "Guaranteed-return language"],
  },
  {
    slug: "fake-sebi-registration",
    title: "The borrowed registration number",
    hook: "“SEBI Registered” in the profile, sometimes with a real-looking INH number.",
    example: "SEBI Registered RA ✅ INH000099999. 100% accuracy calls. Fees ₹4,999/month to advisorpay@ybl",
    steps: ["A tipster copies or invents a registration number.", "Fees go to a personal UPI handle instead of the registered entity.", "Calls promise accuracy or fixed returns, which registered analysts are barred from."],
    tells: ["Registration number that doesn't match the name", "Payments to personal UPI ids", "Accuracy or return promises"],
    oroChecks: ["SEBI register lookup by number and name", "UPI handle check (registered entities use @valid handles)", "Return-promise language"],
  },
  {
    slug: "ipo-allotment",
    title: "The IPO allotment “balance”",
    hook: "“Your IPO allotment is confirmed, pay the balance to receive shares.”",
    example: "IPO allotment confirmed ✅ Pay ₹15,000 balance to grey-market agent to receive shares.",
    steps: ["Messages target people who recently applied for an IPO.", "A fake agent asks for a “balance” or “grey-market premium”.", "The money goes to a personal account."],
    tells: ["Any payment request after applying", "“Grey market” agents", "Pressure to pay today"],
    oroChecks: ["Payment requests to personal accounts", "Urgency language", "Fake-process patterns"],
  },
  {
    slug: "assured-return-fund",
    title: "The “assured return” fund",
    hook: "A scheme that sounds like a mutual fund but promises fixed yearly returns.",
    example: "Switch your SIP to Fixed Income Plus: 18% assured yearly. Reply YES.",
    steps: ["A caller or SMS uses mutual-fund words: SIP, NAV, scheme.", "It promises an assured return.", "Money goes to an unregistered entity."],
    tells: ["“Assured” or “guaranteed” with a percentage", "A scheme name you can't find on AMFI"],
    oroChecks: ["Guaranteed-return language", "Scheme name against the AMFI scheme master"],
  },
  {
    slug: "insider-tip",
    title: "The insider tip",
    hook: "“My cousin works there. Results will be huge. Don't tell anyone.”",
    example: "Insider news: Kaveri Power results will double profit. Buy before Monday, don't share.",
    steps: ["A tip claims non-public information.", "Secrecy and a deadline create urgency.", "Even if true, trading on it is illegal; usually it's invented."],
    tells: ["“Insider”, “inside news”, “don't share”", "A deadline before a company event"],
    oroChecks: ["Secrecy language", "Whether the company has filed anything matching"],
  },
  {
    slug: "celebrity-endorsement",
    title: "The borrowed celebrity",
    hook: "A famous investor or TV anchor “recommends” a stock or bot, often in a doctored video.",
    example: "As seen on CNBC: my AI bot made ₹2 crore last month. Join free masterclass.",
    steps: ["Clips of real people are edited or voice-cloned.", "The ad links to a group or a paid course.", "The group funnels people into a pump or a fake app."],
    tells: ["TV logos on WhatsApp forwards", "Bots with impossible results", "Free masterclass → paid VIP group"],
    oroChecks: ["Fake-authority language", "Private group links"],
  },
  {
    slug: "kyc-phishing",
    title: "The KYC update link",
    hook: "“Your demat will be blocked today. Update KYC now.”",
    example: "Your account will be blocked today. Update KYC now: zerodha-kyc-update.in/login",
    steps: ["A threat and a deadline arrive by SMS.", "The link leads to a copy of your broker's login page.", "Your password and OTP are captured."],
    tells: ["Threat + deadline", "A domain that's almost your broker's"],
    oroChecks: ["Look-alike domain detection against broker and exchange domains"],
  },
  {
    slug: "fake-regulator",
    title: "The fake SEBI officer",
    hook: "A caller says your demat is under investigation and asks for a deposit to avoid a freeze.",
    example: "I'm a SEBI officer. Your demat is under investigation. Pay ₹25,000 security deposit to avoid freeze.",
    steps: ["Someone claims to be from SEBI, an exchange or the police.", "They threaten a freeze or arrest.", "They ask for a deposit or ‘verification’ payment."],
    tells: ["Regulators don't call individuals for payments", "Threats, urgency and secrecy together"],
    oroChecks: ["Fake-authority patterns", "Payment demands"],
  },
  {
    slug: "inflated-news",
    title: "The real news, inflated",
    hook: "A true filing, with one number changed. The hardest kind to spot.",
    example: "KAVERI POWER ko ₹4,200 crore ka order mila hai! (Filing: ₹420 crore.)",
    steps: ["A real company announcement is picked up.", "The number is inflated, or the date or counterparty changed.", "Because part of it is true, people stop checking."],
    tells: ["Big round numbers", "No link to the filing", "Excitement out of proportion to the company's size"],
    oroChecks: ["Claim-by-claim comparison with the exchange filing, number by number"],
  },
];
