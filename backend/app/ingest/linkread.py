"""Read what a shared link actually says (Parakh link input), safely.

SSRF guard: only http(s) on ports 80/443, every hop's host must resolve to public IPs only,
at most 3 redirects (each re-checked), 2 MB and 8 s caps, text/html or text/plain only.
Special cases: Telegram public posts (embed widget), X/Twitter (public oEmbed), YouTube (oEmbed
title). Returns plain text for the normal check pipeline; nothing is stored except that text.
"""

import asyncio
import ipaddress
import re
import socket
from dataclasses import dataclass
from urllib.parse import quote, urljoin, urlsplit

import httpx
from selectolax.lexbor import LexborHTMLParser as HTMLParser

from app.core.config import get_settings

MAX_BYTES = 2 * 1024 * 1024
TIMEOUT_S = 8.0
MAX_REDIRECTS = 3


class LinkRefused(Exception):
    """User-facing reason the link couldn't be read."""


@dataclass
class LinkText:
    url: str
    title: str
    text: str


def _public(ip: str) -> bool:
    a = ipaddress.ip_address(ip)
    return a.is_global and not (a.is_multicast or a.is_reserved or a.is_link_local)


async def check_url(url: str) -> str:
    """Normalise and validate a URL; raises LinkRefused when it isn't safe to fetch."""
    if not re.match(r"^https?://", url, re.I):
        url = f"https://{url}"
    u = urlsplit(url)
    if u.scheme not in ("http", "https") or not u.hostname:
        raise LinkRefused("That doesn't look like a web link.")
    if u.username or u.password:
        raise LinkRefused("Links with a username or password inside aren't opened.")
    if u.port not in (None, 80, 443):
        raise LinkRefused("Links to unusual ports aren't opened.")
    host = u.hostname
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise LinkRefused("That website doesn't exist or isn't reachable.") from exc
    ips = {i[4][0] for i in infos}
    if not ips or not all(_public(ip) for ip in ips):
        raise LinkRefused("That link points to a private network address, so ORO won't open it.")
    return url


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def extract_html(html: str) -> tuple[str, str]:
    tree = HTMLParser(html)
    for sel in ("script", "style", "noscript", "nav", "footer", "header", "form", "svg", "iframe"):
        for n in tree.css(sel):
            n.decompose()

    def meta(*names: str) -> str:
        for n in names:
            node = tree.css_first(f'meta[property="{n}"]') or tree.css_first(f'meta[name="{n}"]')
            if node and node.attributes.get("content"):
                return _clean(node.attributes["content"] or "")
        return ""

    title = meta("og:title", "twitter:title") or _clean(
        tree.css_first("title").text() if tree.css_first("title") else ""
    )
    desc = meta("og:description", "description", "twitter:description")
    root = tree.css_first("article") or tree.css_first("main") or tree.body
    paras = [_clean(p.text()) for p in (root.css("h1, h2, p, li") if root else [])]
    body = " ".join(p for p in paras if len(p) > 30)
    text = " ".join(x for x in (desc, body) if x)
    return title[:300], text[:3500]


async def _get(client: httpx.AsyncClient, url: str) -> httpx.Response:
    for _ in range(MAX_REDIRECTS + 1):
        url = await check_url(url)
        async with client.stream("GET", url) as resp:
            if resp.is_redirect and resp.headers.get("location"):
                url = urljoin(url, resp.headers["location"])
                continue
            ctype = resp.headers.get("content-type", "")
            if resp.status_code >= 400:
                raise LinkRefused(f"The website answered with an error ({resp.status_code}).")
            if not any(
                t in ctype
                for t in ("text/html", "text/plain", "application/json", "application/xhtml")
            ):
                raise LinkRefused("That link is a file, not a web page. ORO doesn't open files.")
            chunks, size = [], 0
            async for c in resp.aiter_bytes():
                size += len(c)
                if size > MAX_BYTES:
                    break
                chunks.append(c)
            resp._content = b"".join(chunks)  # noqa: SLF001 - capped body
            return resp
    raise LinkRefused("That link redirects too many times.")


async def read_link(url: str, *, transport: httpx.AsyncBaseTransport | None = None) -> LinkText:
    url = await check_url(url.strip())
    host = (urlsplit(url).hostname or "").lower().removeprefix("www.")
    headers = {"User-Agent": get_settings().http_user_agent, "Accept-Language": "en-IN,en;q=0.9"}
    async with httpx.AsyncClient(
        timeout=TIMEOUT_S, follow_redirects=False, headers=headers, transport=transport
    ) as client:
        try:
            if host in ("t.me", "telegram.me") and re.match(r"^/[\w]+/\d+", urlsplit(url).path):
                r = await _get(client, f"{url.split('?')[0]}?embed=1&mode=tme")
                tree = HTMLParser(r.text)
                node = tree.css_first(".tgme_widget_message_text")
                owner = tree.css_first(".tgme_widget_message_owner_name")
                if node:
                    return LinkText(
                        url,
                        f"Telegram: {_clean(owner.text()) if owner else ''}",
                        _clean(node.text(separator=" "))[:3500],
                    )
            if host in ("x.com", "twitter.com", "mobile.twitter.com"):
                r = await _get(
                    client,
                    f"https://publish.twitter.com/oembed?omit_script=1&url={quote(url, safe='')}",
                )
                data = r.json()
                blockquote = HTMLParser(data.get("html", "")).css_first("blockquote p")
                if blockquote:
                    return LinkText(
                        url,
                        f"Post by {data.get('author_name', '')}",
                        _clean(blockquote.text(separator=" ")),
                    )
            if host in ("youtube.com", "m.youtube.com", "youtu.be"):
                r = await _get(
                    client, f"https://www.youtube.com/oembed?format=json&url={quote(url, safe='')}"
                )
                data = r.json()
                return LinkText(
                    url, f"YouTube: {data.get('author_name', '')}", _clean(data.get("title", ""))
                )
            r = await _get(client, url)
        except httpx.HTTPError as exc:
            raise LinkRefused("ORO couldn't open that link right now.") from exc
        if "text/plain" in r.headers.get("content-type", ""):
            return LinkText(url, "", _clean(r.text)[:3500])
        title, text = extract_html(r.text)
        return LinkText(url, title, text)


def as_check_text(link: LinkText) -> str:
    """Keeps the URL (for link forensics) and what the page says (for claim checking)."""
    parts = [link.url]
    if link.title:
        parts.append(link.title)
    if link.text:
        parts.append(link.text)
    return "\n\n".join(parts)[:4000]
