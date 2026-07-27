#!/usr/bin/env python3
"""Search + download free, high-res LANDSCAPE PHOTOS matching a batch theme
→ dashboard-bakgrunder. Källa: **Wikimedia Commons** (ingen API-nyckel, riktiga
högupplösta original, fria licenser). Skriver attribution per bild som JSON på
stdout så att batch-processen kan kreditera fotona i dashboardens hörn.

Beroenden: bara standardbiblioteket (urllib).

Usage:
  python bin/batch-bg.py "<sökfras>" <out.jpg> [--count N] [--seed S]
                         [--index N] [--ledger <fil>] [--allow-reuse]

  # normalfallet i en batch: 6 bilder som dashboarden cyklar mellan
  python bin/batch-bg.py "sweden summer lake forest" reports/$BAS-img/bg.jpg \
      --count 6 --seed $BAS --ledger docs/batch-historik.json

TRE EGENSKAPER SOM ÄR DEL AV KONTRAKTET, INTE FINESSER:

1. **Flera bilder per batch.** `--count N` (förval 6) hämtar upp till N bilder som
   `<stam>1.jpg … <stam>N.jpg` — dashboarden cyklar mellan dem under körningen och
   låter användaren stega mellan dem i peek-läget. Finns färre bra träffar än N
   hämtas de som finns, och svaret bär `wanted` kontra `got` så att det syns.
   `--count 1` skriver exakt den utfil som anges (bakåtkompatibelt).

2. **Variation.** Skriptet tog tidigare alltid den STÖRSTA träffen, vilket gjorde
   det deterministiskt: samma sökfras gav samma foto varje gång, så flera batchar
   med samma tema fick identisk bakgrund. Nu rankas kandidaterna på storlek, de
   bästa (topp ~24) behålls, och urvalet lottas. `--seed` gör lotten reproducerbar
   per batch (skicka batchens basnamn); utan seed slumpas den fritt.

3. **Ingen bild två gånger.** `--ledger <fil>` pekar på en liten JSON-logg
   (`{"namn": [...], "bilder": [...]}`) över vad tidigare batchar redan använt.
   Loggade Commons-titlar filtreras BORT ur kandidaterna, och de som hämtas
   skrivs in i loggen. Det är mekaniken bakom "en batch ska inte se ut som den
   förra"; `--allow-reuse` stänger av filtreringen om man medvetet vill upprepa.
   Loggens `namn`-lista rörs inte här — den skrivs av batch-processen.

(Openverse testades men kräver numera API-nyckel för programmatiska anrop → 401.
Commons är nyckelfritt; filtrerar bort kartor/diagram/logotyper och lottar bland
de största kvarvarande landskapsfotona.)
"""
import sys, os, re, json, time, random, hashlib, urllib.request, urllib.parse

UA = {"User-Agent": "webapp-kit-batch/1.1"}
API = "https://commons.wikimedia.org/w/api.php"
BAD = ("map", "diagram", "chart", "sign", "plan", "painting", "logo", "poster", "coat of arms")

#: hur många av de största kandidaterna som får vara med i lotten. Måste vara
#: rejält större än --count, annars blir "lotten" bara "listan".
POOL = 24
#: förval på antal bilder per batch — dashboarden cyklar mellan dem.
DEFAULT_COUNT = 6


def _open(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40)


def _strip(html: str) -> str:
    return re.sub(r"<[^>]+>", "", html or "").strip()


def _parse_args(argv):
    """Positionella: fras, utfil. Flaggor: --count, --seed, --index, --ledger, --allow-reuse."""
    pos, opt = [], {"count": DEFAULT_COUNT, "seed": None, "index": None, "ledger": None, "reuse": False}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--count" and i + 1 < len(argv):
            opt["count"] = max(1, int(argv[i + 1])); i += 2
        elif a == "--seed" and i + 1 < len(argv):
            opt["seed"] = argv[i + 1]; i += 2
        elif a == "--index" and i + 1 < len(argv):
            opt["index"] = int(argv[i + 1]); i += 2
        elif a == "--ledger" and i + 1 < len(argv):
            opt["ledger"] = argv[i + 1]; i += 2
        elif a == "--allow-reuse":
            opt["reuse"] = True; i += 1
        else:
            pos.append(a); i += 1
    return pos, opt


def _read_ledger(path):
    """Loggen är avsiktligt förlåtande: saknas den, är den tom eller trasig ska en
    batch ändå kunna starta — den bär bekvämlighet, inte sanning om världen."""
    if not path or not os.path.exists(path):
        return {"namn": [], "bilder": []}
    try:
        d = json.load(open(path, encoding="utf-8"))
        d.setdefault("namn", [])
        d.setdefault("bilder", [])
        return d
    except Exception:
        return {"namn": [], "bilder": []}


def _write_ledger(path, led, new_titles):
    if not path:
        return False
    seen = set(led.get("bilder") or [])
    for t in new_titles:
        if t not in seen:
            led["bilder"].append(t)
            seen.add(t)
    try:
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(led, f, ensure_ascii=False, indent=2)
            f.write("\n")
        return True
    except Exception:
        return False


def _outfile(outpath, n, count):
    """count == 1 → exakt den angivna filen (bakåtkompatibelt).
    count > 1  → <stam>1.jpg, <stam>2.jpg, … i samma katalog."""
    if count == 1:
        return outpath
    stem, ext = os.path.splitext(outpath)
    return f"{stem}{n}{ext or '.jpg'}"


def _meta(p, ii, path):
    m = ii.get("extmetadata", {})
    return {
        "file": os.path.basename(path), "path": path, "title": p.get("title"),
        "artist": _strip((m.get("Artist") or {}).get("value")),
        "license": (m.get("LicenseShortName") or {}).get("value"),
        "description": _strip((m.get("ImageDescription") or {}).get("value"))[:120],
        "source": (ii.get("descriptionurl") or ii.get("url")),
        "width": ii.get("width"), "height": ii.get("height"),
        "bytes": os.path.getsize(path) if os.path.exists(path) else 0,
    }


def main() -> int:
    pos, opt = _parse_args(sys.argv[1:])
    if len(pos) != 2:
        print('Usage: batch-bg.py "<sökfras>" <out.jpg> [--count N] [--seed S] '
              '[--index N] [--ledger <fil>] [--allow-reuse]', file=sys.stderr)
        return 64
    query, outpath = pos
    count = opt["count"]
    q = f"{query} -map -diagram filetype:bitmap"
    url = API + "?" + urllib.parse.urlencode({
        "action": "query", "generator": "search", "gsrsearch": q,
        "gsrnamespace": "6", "gsrlimit": "60",
        "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata",
        "iiurlwidth": "1920", "format": "json",
    })
    try:
        data = json.load(_open(url))
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"search failed: {e}"}))
        return 1

    led = _read_ledger(opt["ledger"])
    used = set() if opt["reuse"] else set(led.get("bilder") or [])

    pages = (data.get("query") or {}).get("pages", {})
    cands, excluded = [], 0
    for p in pages.values():
        ii = (p.get("imageinfo") or [{}])[0]
        w, h = ii.get("width") or 0, ii.get("height") or 0
        title = p.get("title") or ""
        if "jpeg" not in ii.get("mime", ""):
            continue
        if not (w and h and w > h * 1.3 and w >= 1800):
            continue
        if any(b in title.lower() for b in BAD):
            continue
        if title in used:
            excluded += 1
            continue
        cands.append((w, p, ii))
    if not cands:
        print(json.dumps({"ok": False, "error": "no suitable landscape photos",
                          "excluded_as_already_used": excluded}))
        return 1

    # Största först (kvalitet), stabil sekundärnyckel på titeln så att --seed ger
    # samma urval vid en omkörning även om Commons svarar i annan ordning.
    cands.sort(key=lambda c: (-c[0], (c[1].get("title") or "")))
    pool = cands[:POOL]
    order = list(range(len(pool)))
    if opt["index"] is not None:
        start = opt["index"] % len(pool)
        order = [(start + k) % len(pool) for k in range(len(pool))]
    else:
        if opt["seed"] is not None:
            rnd = random.Random(int(hashlib.sha256(opt["seed"].encode("utf-8")).hexdigest()[:12], 16))
        else:
            rnd = random.Random()
        rnd.shuffle(order)

    os.makedirs(os.path.dirname(outpath) or ".", exist_ok=True)
    images, errors, titles = [], [], []
    for idx in order:
        if len(images) >= count:
            break
        _, p, ii = pool[idx]
        src = ii.get("thumburl") or ii.get("url")
        dest = _outfile(outpath, len(images) + 1, count)
        # Commons svarar 429 när man hämtar många bilder tätt. Ett 429 betyder
        # "vänta", inte "finns inte" — därför försöker vi SAMMA kandidat igen med
        # växande paus innan vi går vidare. Utan detta tappar en batch bilder av
        # ren otur och rapporterar got < wanted som om träffarna vore få.
        ok = False
        for tries in range(3):
            try:
                with _open(src) as resp, open(dest, "wb") as f:
                    f.write(resp.read())
                ok = True
                break
            except Exception as e:
                last = e
                time.sleep(2.5 * (tries + 1))
        if not ok:
            errors.append(f"{p.get('title')}: {last}")
            continue
        images.append(_meta(p, ii, dest))
        titles.append(p.get("title"))
        time.sleep(0.8)  # hövlighetspaus mellan nedladdningar
    if not images:
        print(json.dumps({"ok": False, "error": "download failed", "attempts": errors}))
        return 1

    wrote_ledger = _write_ledger(opt["ledger"], led, titles)
    print(json.dumps({
        "ok": True, "images": images,
        "wanted": count, "got": len(images),
        "candidates": len(cands), "pool": len(pool),
        "excluded_as_already_used": excluded,
        "ledger": opt["ledger"], "ledger_written": wrote_ledger,
        "seed": opt["seed"], "index": opt["index"],
        "failed": errors,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
