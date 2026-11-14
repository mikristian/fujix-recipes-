#!/usr/bin/env python3
"""Build a non-destructive, attributed browsing index for FujiX Sync's saved recipes.

Reads the existing PDF-derived catalog, optionally requests public creator articles,
and writes only web/recipe-enrichment.json and docs/RECIPE-SOURCE-AUDIT.md.
Never changes camera profiles, recipe settings, source photos or the original catalog.
"""

from __future__ import annotations

import concurrent.futures
import datetime
import html
import json
import pathlib
import re
import datetime
import urllib.error
import urllib.parse
import urllib.request

from bs4 import BeautifulSoup

ROOT = pathlib.Path(__file__).resolve().parents[1]
CATALOG = ROOT / "web" / "recipes.json"
OUT = ROOT / "web" / "recipe-enrichment.json"
REPORT = ROOT / "docs" / "RECIPE-SOURCE-AUDIT.md"
MAX_BODY = 1_400_000
KNOWN_SIMULATIONS = (
    "Eterna Bleach Bypass", "Nostalgic Negative", "Nostalgic Neg.",
    "Classic Negative", "Classic Neg.", "Classic Chrome", "Reala Ace",
    "Pro Neg. Hi", "Pro Neg. Std", "Provia", "Velvia", "Astia", "Acros",
    "Monochrome", "Eterna",
)
KNOWN_DOMAINS = {
    "fujixweekly.com": "Fuji X Weekly",
    "www.fujixweekly.com": "Fuji X Weekly",
    "film.recipes": "Film Recipes",
    "www.rossandhisjpegs.com": "Ross and His JPEGS",
    "fujifilmsimulations.com": "Fujifilm Simulations",
    "www.osan-bilgi.com": "Osan Bilgi",
    "www.shuttergroove.com": "ShutterGroove",
    "www.hemelsteen.nl": "Hemelsteen",
    "lifeunintended.com": "Life, Unintended",
    "www.tiktok.com": "TikTok creator link",
    "youtu.be": "YouTube creator link",
}
NOTE_RECOVERED_LINKS = {
    # These direct creator links are present in the owner's Fuji recipe Apple Note
    # but missing/shortened in the PDF-derived JSON. The source catalog stays intact.
    "backup-6-slot-1": ["https://fujixweekly.com/2023/12/19/kodak-vision3-250d-v2-fujifilm-x-t5-x-trans-v-film-simulation-recipe/"],
    "backup-13-slot-1": ["https://fujixweekly.com/2020/04/12/my-fujifilm-x-t30-cyanotype-film-simulation-recipe/"],
    "backup-11-slot-7": ["https://fujixweekly.com/2023/10/24/kodak-gold-200-fujifilm-x-t5-x-trans-v-film-simulation-recipe/"],
}
SIMULATION_STYLES = {
    "classic chrome": "muted, documentary-style color and controlled saturation",
    "classic negative": "a nostalgic color-negative palette with distinctive tonal shifts",
    "classic neg.": "a nostalgic color-negative palette with distinctive tonal shifts",
    "nostalgic negative": "warm, amber-leaning highlights and a print-film character",
    "nostalgic neg.": "warm, amber-leaning highlights and a print-film character",
    "reala ace": "balanced, natural-looking color and subtle contrast",
    "eterna": "cinematic tonality with gentle color rendering",
    "eterna bleach bypass": "low-saturation cinematic color with pronounced contrast",
    "astia": "soft, subtle color suitable for gentle portrait-like rendering",
    "velvia": "saturated color and strong landscape-style color separation",
    "provia": "a balanced, all-purpose Fujifilm color starting point",
    "acros": "monochrome tonality with classic black-and-white character",
    "monochrome": "a black-and-white tonal palette",
    "pro neg. std": "subtle, low-key color with portrait-film restraint",
    "pro neg. hi": "more pronounced contrast for portrait-style color",
}
MANUAL = {
    "backup-1-slot-2": (
        "A tungsten-inspired CineStill 800T look, built around Eterna with pronounced grain and atmospheric color for evening scenes.",
        "Fuji X Weekly explains that the inspiration is tungsten-balanced motion-picture stock, especially its cool daylight rendering and luminous city lights. The X-Trans V variant adjusts the blue color treatment.",
    ),
    "backup-1-slot-5": (
        "A high-grain black-and-white look modeled on Kodak Tri-X 400, with bold tonal separation and classic documentary character.",
        "Fuji X Weekly credits Anders Lindborg with developing this Tri-X-inspired recipe and discusses low-, medium-, and high-contrast variants inspired by film development and printing choices.",
    ),
}


def tidy(value: str, limit: int = 280) -> str:
    cleaned = re.sub(r"\s+", " ", html.unescape(value or "")).strip()
    return cleaned[:limit].rstrip()


def urls_for_slot(slot: dict) -> list[str]:
    links: list[str] = []
    for original in slot.get("links") or []:
        # The owner's exported PDF occasionally concatenated two original links.
        for candidate in re.split(r"(?=https?://)", original):
            candidate = candidate.strip()
            if not candidate.startswith(("https://", "http://")):
                continue
            candidate = candidate.split()[0].strip('\\\"\'<>')
            parsed = urllib.parse.urlsplit(candidate)
            if not parsed.hostname:
                continue
            if parsed.hostname.lower() in ("fujixweekly.com", "www.fujixweekly.com"):
                # Preserve recipe identity while omitting social ad tracking.
                candidate = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))
            if candidate not in links:
                links.append(candidate)
    for candidate in NOTE_RECOVERED_LINKS.get(slot.get("id"), []):
        if candidate not in links:
            links.append(candidate)
    return links


def creator_name(url: str) -> str:
    host = (urllib.parse.urlsplit(url).hostname or "").lower()
    return KNOWN_DOMAINS.get(host, host.removeprefix("www."))


def primary_source(urls: list[str]) -> str | None:
    for url in urls:
        parsed = urllib.parse.urlsplit(url)
        if parsed.hostname in ("fujixweekly.com", "www.fujixweekly.com") and parsed.query and not re.match(r"^/\d{4}/\d{2}/\d{2}/", parsed.path):
            continue
        if not any(x in (parsed.hostname or "") for x in ("tiktok.com", "youtube.com", "youtu.be", "facebook.com")):
            return url
    return urls[0] if urls else None


def film_base(slot: dict) -> str | None:
    vals = slot.get("settings") or {}
    setting = str(vals.get("filmSimulation") or "")
    raw = str(slot.get("rawText") or "")
    for source in (setting, raw[:650]):
        lower = source.lower()
        for sim in KNOWN_SIMULATIONS:
            if sim.lower() in lower:
                return sim
    return None


def summary(slot: dict, film: str | None) -> str:
    label = slot["name"].strip()
    mono = bool(re.search(r"(tri.?x|acros|t.max|black.?white|monochrome|cyanotype|xp2)", label, re.I))
    if film:
        style = SIMULATION_STYLES.get(film.lower())
        base = f"Built on Fujifilm's {film} simulation"
        base += f", this look starts with {style}" if style else ""
    else:
        base = "A custom Fujifilm film-simulation configuration"
    if mono and (film or "").lower() in ("acros", "monochrome"):
        base += " in monochrome"
    return base + ". The saved creator settings shape the final color, grain and contrast; use the reference photograph to assess this particular variant."


def article_metadata(url: str) -> dict:
    """Inspect a bounded creator article; capture image URLs, never download images."""
    host = (urllib.parse.urlsplit(url).hostname or "").lower()
    path = urllib.parse.urlsplit(url).path
    if host in ("fujixweekly.com", "www.fujixweekly.com", "film.recipes") and not re.match(r"^/\d{4}/\d{2}/\d{2}/", path):
        return {"status": "index-link-only"}
    if host == "www.hemelsteen.nl" and path.rstrip("/") == "/photography":
        return {"status": "index-link-only"}
    if host in ("www.tiktok.com", "youtu.be", "www.facebook.com"):
        return {"status": "creator-link-only"}
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; FujiX-Personal-Recipe-Library/1.0)"})
    try:
        with urllib.request.urlopen(req, timeout=7) as response:
            content_type = response.headers.get("Content-Type", "")
            if "text/html" not in content_type or response.status != 200:
                return {"status": "not-verified"}
            final_host = (urllib.parse.urlsplit(response.geturl()).hostname or "").lower()
            if final_host not in KNOWN_DOMAINS:
                return {"status": "not-verified"}
            page = response.read(MAX_BODY + 1)
            if len(page) > MAX_BODY:
                return {"status": "not-verified"}
    except Exception:
        return {"status": "not-verified"}
    soup = BeautifulSoup(page, "html.parser")
    # Some creator themes place their site's title in article h1; the article
    # og:title and entry-title are less likely to be generic site navigation.
    title_meta = soup.select_one('meta[property="og:title"]')
    title = tidy(title_meta.get("content", ""), 180) if title_meta else ""
    if not title:
        heading = soup.select_one("h1.entry-title, article h1.entry-title, article h1, h1")
        title = tidy(heading.get_text(" ", strip=True), 180) if heading else ""
    if title.upper() in ("FUJI X WEEKLY", "FILM RECIPES", "HOME"):
        title = ""
    author = ""
    a = soup.select_one('meta[name="author"]')
    if a:
        author = tidy(a.get("content", ""), 90)
    if not author:
        a = soup.select_one("article .author, .byline .author, .entry-meta .author")
        author = tidy(a.get_text(" ", strip=True), 90) if a else ""
    container = soup.select_one("article .entry-content, article .post-content, article, main") or soup
    paras = []
    for p in container.select("p"):
        content = tidy(p.get_text(" ", strip=True), 900)
        if len(content) < 65 or len(content) > 850:
            continue
        if re.match(r"(film simulation:|dynamic range:|grain effect:|white balance:|color chrome effect:|this post contains affiliate)", content, re.I):
            break
        if re.search(r"(Amazon|B&H|Affiliate links|Patron subscription)", content, re.I):
            continue
        paras.append(content)
        if len(paras) >= 3:
            break
    excerpt = ""
    for p in paras:
        # This is an attributed short excerpt only, not a wholesale reproduction.
        words = p.split()
        if len(words) >= 10:
            excerpt = " ".join(words[:18])
            excerpt += "" if len(words) <= 18 else "…"
            break
    sample_photos = []
    for picture in container.select("figure img, .wp-block-image img, .gallery img, img.wp-image-68109, img"):
        src = picture.get("src") or picture.get("data-src") or ""
        if src.startswith("//"):
            src = "https:" + src
        if src.startswith("/"):
            src = urllib.parse.urljoin(url, src)
        parsed_img = urllib.parse.urlsplit(src)
        img_host = (parsed_img.hostname or "").lower()
        # Keep media on the creator's own domain or WordPress's image cache for
        # that *same creator*. Don't pick up ads, logos or unrelated stock.
        same_creator = img_host in (host, "www." + host, host.removeprefix("www."))
        wp_cache = img_host in ("i0.wp.com", "i1.wp.com", "i2.wp.com", "i3.wp.com") and (
            parsed_img.path.startswith("/" + host + "/wp-content/uploads/")
            or parsed_img.path.startswith("/" + host.removeprefix("www.") + "/wp-content/uploads/")
        )
        if parsed_img.scheme != "https" or not (same_creator or wp_cache):
            continue
        if not re.search(r"\.(?:jpe?g|png|webp)$", parsed_img.path, re.I):
            continue
        width = int(picture.get("width") or 0) if str(picture.get("width") or "0").isdigit() else 0
        height = int(picture.get("height") or 0) if str(picture.get("height") or "0").isdigit() else 0
        if width and width < 300 or height and height < 250:
            continue
        if not (wp_cache or "/wp-content/uploads/" in parsed_img.path or "/media/" in parsed_img.path):
            continue
        if src not in sample_photos:
            sample_photos.append(src)
        if len(sample_photos) == 8:
            break
    article_date = ""
    published = soup.select_one('meta[property="article:published_time"]')
    if published and published.get("content"):
        article_date = tidy(published["content"].split("T")[0], 15)
    if not article_date and re.match(r"^/\d{4}/\d{2}/\d{2}/", path):
        article_date = path.strip("/").split("/", 3)
        article_date = "-".join(article_date[:3])
    # Confirm author-provided capture details only when the words appear in
    # the source's own article paragraphs. These are descriptive, not advice.
    creator_notes = []
    paragraphs = " ".join(paras[:3])
    if re.search(r"\bHelios\b", paragraphs, re.I):
        creator_notes.append("The article discusses photographs taken with a Helios vintage lens.")
    if re.search(r"\bCineBloom\b", paragraphs, re.I):
        creator_notes.append("The creator describes using CineBloom diffusion filters in some samples.")
    if re.search(r"\bmanual vintage lens", paragraphs, re.I) and not any("vintage lens" in x for x in creator_notes):
        creator_notes.append("Some sample photographs were made using manual vintage lenses.")
    return {
        "status": "article-checked", "articleTitle": title, "articleAuthor": author,
        "sourceExcerpt": excerpt, "samplePhotos": sample_photos,
        "publishedDate": article_date, "creatorNotes": creator_notes,
    }


def main():
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    slots = [(b.get("backupNumber"), slot) for b in catalog["backups"] for slot in b["slots"]]
    urls = {}
    for _, slot in slots:
        src = primary_source(urls_for_slot(slot))
        if src:
            urls[src] = None
    with concurrent.futures.ThreadPoolExecutor(max_workers=7) as pool:
        futures = {pool.submit(article_metadata, url): url for url in urls}
        for future in concurrent.futures.as_completed(futures):
            url = futures[future]
            try:
                urls[url] = future.result()
            except Exception:
                urls[url] = {"status": "not-verified"}
    result = {}
    for number, slot in slots:
        links = urls_for_slot(slot)
        source = primary_source(links)
        meta = urls.get(source) or {}
        sim = film_base(slot)
        description = summary(slot, sim)
        background = (
            f"Saved in your X100VI recipe notes under Backup {number}, Slot {slot['slotNumber']}."
            " The source article has not yet been verified; use the linked creator page for its original explanation."
            if source else
            f"Saved in your X100VI recipe notes under Backup {number}, Slot {slot['slotNumber']}. No creator article link was recorded for this entry."
        )
        if meta.get("status") == "article-checked":
            title = meta.get("articleTitle") or slot["name"]
            author = meta.get("articleAuthor")
            attribution = f"{creator_name(source)}" + (f" ({author})" if author else "")
            background = f"Source: {attribution}, “{title}.”"
            if meta.get("sourceExcerpt"):
                background += f" From the creator's article: “{meta['sourceExcerpt']}”"
            if meta.get("publishedDate"):
                background += f" Published {meta['publishedDate']}."
            if meta.get("creatorNotes"):
                background += " " + " ".join(meta["creatorNotes"])
            background += " See the linked original article for the complete story and examples."
        if slot["id"] in MANUAL and meta.get("status") == "article-checked":
            description, background = MANUAL[slot["id"]]
            background += " Source: Fuji X Weekly; follow the original article link."
        result[slot["id"]] = {
            "id": slot["id"],
            "description": description,
            "background": background,
            "sourceUrl": source,
            "sourceUrls": links,
            "sourceLabel": creator_name(source) if source else None,
            "sourceStatus": meta.get("status", "missing-link") if source else "missing-link",
            "sourceVerified": meta.get("status") == "article-checked",
            "articleTitle": meta.get("articleTitle", ""),
            "articleAuthor": meta.get("articleAuthor", ""),
            "publishedDate": meta.get("publishedDate", ""),
            "creatorNotes": meta.get("creatorNotes", []),
            "samplePhotos": meta.get("samplePhotos", []),
            "simulation": sim,
            "backupNumber": number,
        }
    OUT.write_text(json.dumps({"schemaVersion": 1, "origin": "owner-supplied Fuji recipe library", "recipes": result}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    checked = sum(x["sourceVerified"] for x in result.values())
    linked = sum(bool(x["sourceUrl"]) for x in result.values())
    photos = sum(bool(slot.get("photo")) for _,slot in slots)
    REPORT.write_text(
        "# FujiX Sync recipe-source audit\n\n"
        "This source index is **additive**: it does not change the 101 original settings, user-stored camera profiles or reference images.\n\n"
        f"- Original recipes: **{len(slots)}**; existing JSON photo associations: **{photos}** (image folder has independent assets).\n"
        f"- Recipes with at least one source URL in the owner's saved PDF: **{linked}**.\n"
        f"- Public creator articles retrieved and checked while building this index: **{checked}**.\n"
        f"- Sources not independently retrievable or without links: **{len(slots)-checked}**.\n\n"
        "The original Apple Note was examined for relevant source links; three exact creator-article links were recovered "
        "(Kodak Vision3 250D v2, Cyanotype and Kodak Gold 200) without altering the saved 101-recipe archive. "
        "The saved note/PDF has some concatenated hyperlinks, which were split without inventing URLs. "
        "Source links are attributed to their respective third-party creators, not to Fujifilm corporate. "
        "Article excerpts are limited to 18 words with links to the originals. "
        "Visual descriptions are independently written from saved simulation settings; they are not represented as quotes from authors. "
        "Additional sample photos are linked directly from a verified creator article's own photo gallery "
        "(up to eight image links per recipe); they are not downloaded, rehosted or guessed from another recipe. "
        "Articles without verified gallery images retain only their correctly associated local image, if any. "
        "Unretrievable social links and missing creator articles are explicitly labeled unverified.\n",
        encoding="utf-8",
    )
    print(f"Enrichment: {len(slots)} recipes, {linked} linked, {checked} creator articles checked, {photos} original photo mappings")


if __name__ == "__main__":
    main()
