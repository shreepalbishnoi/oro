"""Scam engine rules (PLAN §9.3). English + Hinglish. Titles are ORO's own words and never advise.

Pure functions: anything that needs the database (SEBI register, surveillance flags) is passed
in, so the rules run identically in the API, the Telegram bot and tests."""

import re
from urllib.parse import urlsplit

from rapidfuzz.distance import Levenshtein

from app.verify.scrub import scrub
from app.verify.types import Entity, EvidenceRef, Signal

SEBI_RA_CHECK = "https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=14"
SEBI_HOME = "https://www.sebi.gov.in/"

TRUSTED_DOMAINS = [
    "zerodha.com", "groww.in", "upstox.com", "angelone.in", "icicidirect.com", "hdfcsec.com",
    "kotaksecurities.com", "nseindia.com", "bseindia.com", "sebi.gov.in", "amfiindia.com",
    "camsonline.com", "kfintech.com", "cdslindia.com", "nsdl.co.in", "mfcentral.com",
    "rbi.org.in", "dhan.co", "paytmmoney.com", "5paisa.com", "motilaloswal.com",
]  # fmt: skip
SHORTENERS = {
    "bit.ly", "tinyurl.com", "t.ly", "cutt.ly", "rb.gy", "is.gd", "shorturl.at", "rebrand.ly",
    "tiny.cc", "ow.ly", "s.id", "shorturl.gg",
}  # fmt: skip
BRANDS = [
    "zerodha", "groww", "upstox", "angelone", "angel", "icicidirect", "hdfcsec", "kotak",
    "nse", "bse", "sebi", "amfi", "cdsl", "nsdl", "dhan", "paytmmoney",
]  # fmt: skip

IC = re.IGNORECASE
GUARANTEE = re.compile(
    r"\b(guarantee[sd]?|guaranteed|assured|fixed)\s+(\d+(\.\d+)?\s?%|(\S+\s+){0,3}(returns?|profits?|income|gains?|munafa))"
    r"|\b\d{1,3}(\.\d+)?\s?%\s*(daily|per\s+day|a\s+day|roz|rozana|har\s+din|weekly|per\s+week|monthly|per\s+month|har\s+mahine)\b"
    r"|\b100\s?%\s*(sure|safe|profit|guarantee|pakka|confirmed|certain)|\bsure\s?-?\s?shot\b"
    r"|\b(expected|potential|assured)\s+(returns?|upside|gains?|profit)\s*[:\-–]?\s*\d{2,4}\s?%"
    r"|\bpakka\s+(profit|return|munafa)|\b(zero|no)\s+risk\b|\brisk[\s-]?free\b"
    r"|\bdouble\s+(your\s+)?(money|paisa|investment)|\bpaisa\s+double\b"
    r"|\b\d{2,4}\s?%\s*(returns?|profit|gain|munafa)\s*(in|within|har|every|per)?\s*\d*\s*(days?|din|weeks?|hafte|months?|mahine)?"
    r"|\bloss\s+(nahi|nhi|impossible)\b|गारंटी|पक्का\s+मुनाफा",
    IC,
)
URGENCY = re.compile(
    r"\b(only\s+today|today\s+only|aaj\s+hi|abhi\s+(join|lo|karo)|jaldi|last\s+chance"
    r"|limited\s+(seats?|slots?|time)|hurry|turant|urgent(ly)?|immediately|right\s+now"
    r"|before\s+(the\s+)?market\s+(open(s|ing)?|closes?)|don'?t\s+miss"
    r"|before\s+\d{1,2}(:\d{2})?\s*(am|pm|baje)?|kal\s+tak|offer\s+ends|closing\s+soon"
    r"|next\s+\d+\s+(minutes|mins|hours))\b|आज\s+ही|जल्दी",
    IC,
)
SECRECY = re.compile(
    r"\b(vip\s+(group|channel|call|tips?)|premium\s+(group|channel)|insider\s+(news|info|tip)"
    r"|inside\s+news|operator(\s+game|\s+news)?|confidential|don'?t\s+share"
    r"|kisi\s+ko\s+(mat|na)\s+batana|secret\s+(tip|news|call))\b",
    IC,
)
SEBI_CLAIM = re.compile(
    r"\bsebi[\s-]*(regd\.?|registered|registration|reg\.?|approved\s+advisor|certified)\b|\bINH\d{9}\b",
    IC,
)
RA_NO = re.compile(r"\bINH\d{9}\b", IC)
FAKE_AUTH = re.compile(
    r"\b(sebi|nse|bse|rbi)\s+(approved|endorsed|verified|backed|recommended)\s+(stock|tip|call|share|scheme)"
    r"|\b(endorsed|recommended|backed)\s+by\s+(sebi|nse|bse|rbi|cnbc|zee\s+business|et\s+now)"
    r"|\bas\s+seen\s+on\s+(cnbc|zee|et\s+now|ndtv)",
    IC,
)
UPI = re.compile(
    r"\b[\w.-]{2,}@(okaxis|oksbi|okhdfcbank|okicici|ybl|ibl|axl|paytm|upi|apl|fbl|kotak|icici"
    r"|sbi|hdfcbank|yesbank|freecharge|jupiteraxis)\b",
    IC,
)
VALID_UPI = re.compile(r"\b[\w.-]{2,}@valid\b", IC)
PAYMENT = re.compile(
    r"\b(pay|fees?|subscription|charges?|join\s+fee|membership)\b.{0,30}(₹|rs\.?|inr)\s?\d+"
    r"|(₹|rs\.?)\s?\d+\s*(only|mein|me)\b.{0,20}\b(join|membership|vip|tips?)",
    IC,
)
PRICE_CALL = re.compile(
    r"\b(target|tgt|tp)\s*[:\-–]?\s*(₹|rs\.?)?\s?\d+|\b(sl|stop\s?loss)\s*[:\-–]?\s*\d+"
    r"|\b(entry|cmp)\s*[:\-–]?\s*(₹|rs\.?)?\s?\d+",
    IC,
)
PUMP = re.compile(
    r"\b(multi[\s-]?bagger|rocket|to\s+the\s+moon|upper\s+circuit|uc\s+(lagega|pakka)"
    r"|\d{1,3}x\s+(return|stock|potential)|jackpot|bumper)\b|🚀",
    IC,
)
FORWARDED = re.compile(r"forwarded\s+many\s+times|^forwarded\b", IC | re.M)
PRIVATE_GROUP = re.compile(r"(t\.me/(\+|joinchat)|chat\.whatsapp\.com/|telegram\.me/\+)", IC)
URL_RE = re.compile(r"\b((?:https?://)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:/[^\s]*)?)", IC)


def _span(text: str, pattern: re.Pattern[str]) -> str | None:
    m = pattern.search(text)
    if not m:
        return None
    start, end = max(0, m.start() - 24), min(len(text), m.end() + 24)
    raw = ("…" if start > 0 else "") + text[start:end].strip() + ("…" if end < len(text) else "")
    return scrub(raw)[0]


def host_of(url: str) -> str | None:
    try:
        u = urlsplit(url if re.match(r"^https?://", url, IC) else f"https://{url}")
        host = (u.hostname or "").lower()
    except ValueError:
        return None
    return host.removeprefix("www.") or None


def is_trusted(host: str) -> bool:
    return any(host == d or host.endswith(f".{d}") for d in TRUSTED_DOMAINS)


def link_signals(text: str) -> list[Signal]:
    out: list[Signal] = []
    seen: set[str] = set()
    for m in URL_RE.finditer(text):
        url = m.group(1)
        host = host_of(url)
        if not host or host in seen:
            continue
        # Ignore things like "Rs.420" or "1.5x" picked up as hosts.
        if not re.search(r"[a-z]", host.split(".")[-1]) or host[0].isdigit():
            continue
        seen.add(host)
        trusted = is_trusted(host)
        if re.search(r"\.apk(\?|$)", url, IC):
            out.append(Signal(
                id="link_apk", severity="severe", title="Link downloads an app file (.apk)",
                detail=f"{host} serves an Android app outside the Play Store. Fake trading apps are a common way to take deposits that can't be withdrawn.",
                span=url,
            ))  # fmt: skip
        if host.startswith("xn--") or ".xn--" in host:
            out.append(Signal(
                id="link_idn", severity="severe", title="Link uses look-alike letters",
                detail=f"{host} is an internationalised domain. These can display as a familiar name while pointing somewhere else.",
                span=url,
            ))  # fmt: skip
        if host in SHORTENERS:
            out.append(Signal(
                id="link_shortener", severity="medium", title="Link hides where it goes",
                detail=f"{host} is a URL shortener, so you can't see the real destination before tapping.",
                span=url,
            ))  # fmt: skip
        if not trusted:
            label = ".".join(host.split(".")[:-1])
            flat = re.sub(r"[-.]", "", label)
            for d in TRUSTED_DOMAINS:
                dl = d.split(".")[0]
                brand = next((b for b in BRANDS if b in label), None)
                close = Levenshtein.distance(flat, dl) <= 2 and flat != dl
                if close or (brand and len(brand) >= 3 and dl.startswith(brand)):
                    out.append(Signal(
                        id="link_lookalike", severity="severe",
                        title="Link imitates a known broker or exchange",
                        detail=f"{host} looks like {d} but isn't it. Look-alike domains are used to collect logins and payments.",
                        span=url, evidence=EvidenceRef(label=f"Official site: {d}", url=f"https://{d}"),
                    ))  # fmt: skip
                    break
        if PRIVATE_GROUP.search(url):
            out.append(Signal(
                id="private_group", severity="medium", title="Invites you into a private group",
                detail="Pump-and-dump schemes move people into private Telegram or WhatsApp groups where messages can't be checked or traced later.",
                span=url,
            ))  # fmt: skip
    return out


def registration_numbers(text: str) -> list[str]:
    return sorted({m.group(0).upper() for m in RA_NO.finditer(text)})


def detect_signals(
    raw: str,
    entities: list[Entity],
    registry: dict[str, str] | None = None,
    registry_loaded: bool = True,
) -> list[Signal]:
    """`registry` maps each INH number found in `raw` to its registered name (absent = unknown).
    `registry_loaded=False` (empty register table) downgrades "not found" to "couldn't check"."""
    registry = registry or {}
    s: list[Signal] = []

    if GUARANTEE.search(raw):
        s.append(Signal(
            id="guaranteed_returns", severity="severe", title="Promises fixed or guaranteed returns",
            detail="No listed stock can guarantee a return. SEBI-registered analysts are barred from promising one. This is the single most common sign of an investment scam.",
            span=_span(raw, GUARANTEE),
        ))  # fmt: skip
    if URGENCY.search(raw):
        s.append(Signal(
            id="urgency", severity="medium", title="Pushes you to act fast",
            detail="Deadlines like “only today” are used so you don't have time to check. Real filings don't expire in an hour.",
            span=_span(raw, URGENCY),
        ))  # fmt: skip
    if SECRECY.search(raw):
        s.append(Signal(
            id="secrecy", severity="medium", title="Claims secret or insider information",
            detail="Trading on genuine unpublished price-sensitive information is illegal, and “insider” or “operator” tips are almost always invented to create urgency.",
            span=_span(raw, SECRECY),
        ))  # fmt: skip

    if SEBI_CLAIM.search(raw):
        nums = registration_numbers(raw)
        unknown = [n for n in nums if n not in registry]
        if not nums:
            s.append(Signal(
                id="sebi_claim", severity="medium", title="Claims SEBI registration without a number",
                detail="Registered research analysts must show their registration number (INH…). This message claims registration but gives none to check.",
                span=_span(raw, SEBI_CLAIM),
                evidence=EvidenceRef(label="SEBI register of research analysts", url=SEBI_RA_CHECK),
            ))  # fmt: skip
        elif unknown and not registry_loaded:
            s.append(Signal(
                id="sebi_claim", severity="medium", title=f"Couldn't check registration {unknown[0]} yet",
                detail="ORO's copy of SEBI's register isn't loaded right now. Check the number on SEBI's site, and confirm the name matches the sender.",
                span=unknown[0],
                evidence=EvidenceRef(label="Check on SEBI's register", url=SEBI_RA_CHECK),
            ))  # fmt: skip
        elif unknown:
            s.append(Signal(
                id="sebi_claim", severity="severe",
                title=f"Registration {unknown[0]} is not in SEBI's register",
                detail="We couldn't match this number in ORO's copy of SEBI's register of research analysts. Check it on SEBI's site, and confirm the name matches the sender.",
                span=unknown[0],
                evidence=EvidenceRef(label="Check on SEBI's register", url=SEBI_RA_CHECK),
            ))  # fmt: skip
        else:
            names = ", ".join(f"{n} ({registry[n]})" for n in nums)
            s.append(Signal(
                id="sebi_registered", severity="info", title="Registration number is on SEBI's register",
                detail=f"{names}. A real number can still be quoted by someone else: check that the sender is that entity.",
                evidence=EvidenceRef(label="SEBI register", url=SEBI_RA_CHECK),
            ))  # fmt: skip
        if GUARANTEE.search(raw):
            s.append(Signal(
                id="registered_promise", severity="severe", title="“Registered” sender promising returns",
                detail="SEBI's rules forbid registered analysts from assuring returns. Either the registration claim or the promise is false.",
                evidence=EvidenceRef(label="SEBI research analyst rules", url="https://www.sebi.gov.in/legal/regulations.html"),
            ))  # fmt: skip

    if FAKE_AUTH.search(raw):
        s.append(Signal(
            id="fake_authority", severity="severe", title="Says a regulator or channel backs this tip",
            detail="SEBI, the exchanges and the RBI never approve or endorse individual stock tips. Celebrity and TV endorsements in forwards are routinely faked.",
            span=_span(raw, FAKE_AUTH),
        ))  # fmt: skip

    if (UPI.search(raw) or PAYMENT.search(raw)) and not VALID_UPI.search(raw):
        s.append(Signal(
            id="upi_payment", severity="medium", title="Asks for money to a personal account",
            detail="Registered entities collect fees through verified channels. SEBI's “Validated UPI” handles end in @valid; payments to personal UPI ids are hard to trace or recover.",
            span=_span(raw, UPI if UPI.search(raw) else PAYMENT),
            evidence=EvidenceRef(label="SEBI investor resources", url=SEBI_HOME),
        ))  # fmt: skip
    if PRICE_CALL.search(raw):
        s.append(Signal(
            id="price_call", severity="medium", title="Names exact prices to act at",
            detail="Specific entry and exit prices from an unknown sender are a hallmark of paid “tip” channels. ORO doesn't judge predictions, only facts.",
            span=_span(raw, PRICE_CALL),
        ))  # fmt: skip
    if PUMP.search(raw):
        s.append(Signal(
            id="pump_language", severity="medium", title="Hype language typical of pump schemes",
            detail="Words like “multibagger” and “upper circuit pakka” are used to build a crowd that buys at the same time, so early holders can exit.",
            span=_span(raw, PUMP),
        ))  # fmt: skip
    if FORWARDED.search(raw):
        s.append(Signal(
            id="forwarded", severity="info", title="Forwarded many times",
            detail="The original sender is unknown, so nobody is accountable for this message.",
        ))  # fmt: skip

    s.extend(link_signals(raw))

    for e in entities:
        if e.surveillance:
            s.append(Signal(
                id="surveillance", severity="medium", title=f"{e.name} is under exchange surveillance",
                detail=f"The exchange has placed {e.symbol} under {e.surveillance}, a measure used when price or volume moves look unusual.",
                evidence=EvidenceRef(label="NSE surveillance list", url="https://www.nseindia.com/reports/asm"),
            ))  # fmt: skip
        if e.sme:
            s.append(Signal(
                id="sme_low_float", severity="medium", title=f"{e.name} is a small, thinly traded SME stock",
                detail="SME stocks have few shares in public hands, so a small group can move the price easily. Most pump schemes target them.",
            ))  # fmt: skip
        if e.spike:
            s.append(Signal(
                id="volume_spike", severity="medium", title="Unusual trading before this message",
                detail=f"{e.spike}, based on end-of-day exchange data.",
            ))  # fmt: skip

    order = {"severe": 0, "medium": 1, "info": 2}
    return sorted(s, key=lambda x: order[x.severity])
