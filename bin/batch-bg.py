#!/usr/bin/env python3
"""Search + download a free, high-res LANDSCAPE PHOTO matching a batch theme
→ dashboard background. Source: **Wikimedia Commons** (no API key, stable, genuine
high-res, free licenses). Prints attribution (title/photographer/license/source)
as JSON on stdout so the batch process can credit the photo in the dashboard corner.

Dependency: standard library only (urllib) — no pip installs needed.

Usage:
  python bin/batch-bg.py "<search phrase>" <out.jpg>
  (e.g. "sweden summer lake forest"  reports/batch-<date>-img/bg.jpg)

The batch process (docs/batch-jobb-process.md): run this at batch start with a phrase
matching the batch theme (date/season/content). Swap the photo per batch.

(Openverse was tested but now requires an API key for programmatic calls → 401.
Commons is key-free; filters out art/maps/diagrams and takes the largest landscape photo.)
"""
import sys, os, re, json, urllib.request, urllib.parse

UA = {"User-Agent": "webapp-kit-batch/1.0"}
API = "https://commons.wikimedia.org/w/api.php"
BAD = ("map", "diagram", "chart", "sign", "plan", "painting", "drawing", "logo", "poster", "coat of arms")


def _open(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40)


def _strip(html: str) -> str:
    return re.sub(r"<[^>]+>", "", html or "").strip()


def main() -> int:
    if len(sys.argv) != 3:
        print('Usage: batch-bg.py "<search phrase>" <out.jpg>', file=sys.stderr)
        return 64
    query, outpath = sys.argv[1], sys.argv[2]
    q = f"{query} -painting -drawing -map -diagram filetype:bitmap"
    url = API + "?" + urllib.parse.urlencode({
        "action": "query", "generator": "search", "gsrsearch": q,
        "gsrnamespace": "6", "gsrlimit": "40",
        "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata",
        "iiurlwidth": "1920", "format": "json",
    })
    try:
        data = json.load(_open(url))
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"search failed: {e}"}))
        return 1
    pages = (data.get("query") or {}).get("pages", {})
    best = None
    for p in pages.values():
        ii = (p.get("imageinfo") or [{}])[0]
        w, h = ii.get("width") or 0, ii.get("height") or 0
        title = (p.get("title") or "").lower()
        if "jpeg" not in ii.get("mime", ""):
            continue
        if not (w and h and w > h * 1.3 and w >= 1800):
            continue
        if any(b in title for b in BAD):
            continue
        if not best or w > best[0]:
            best = (w, p, ii)
    if not best:
        print(json.dumps({"ok": False, "error": "no suitable landscape photos"}))
        return 1
    _, p, ii = best
    thumb = ii.get("thumburl") or ii.get("url")
    os.makedirs(os.path.dirname(outpath) or ".", exist_ok=True)
    try:
        with _open(thumb) as resp, open(outpath, "wb") as f:
            f.write(resp.read())
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"download failed: {e}"}))
        return 1
    m = ii.get("extmetadata", {})
    print(json.dumps({
        "ok": True, "path": outpath, "title": p.get("title"),
        "artist": _strip((m.get("Artist") or {}).get("value")),
        "license": (m.get("LicenseShortName") or {}).get("value"),
        "description": _strip((m.get("ImageDescription") or {}).get("value"))[:120],
        "source": (ii.get("descriptionurl") or ii.get("url")),
        "downloaded": thumb, "width": ii.get("width"), "height": ii.get("height"),
        "bytes": os.path.getsize(outpath),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
