#!/usr/bin/env python3
"""Claude Runtime Monitor – ger modellen kontinuerlig koll på sina egna gränser.

Tre datakällor, i fallande ordning av tillförlitlighet:

1. statusLine-JSON (om Claude Code kör statusLine i detta gränssnitt) – auktoritativt:
   context_window.used_percentage + rate_limits.{five_hour,seven_day}.{used_percentage,resets_at}
2. ~/Library/Application Support/Claude/plan-usage-history.json – desktop-appens egen
   femminuters-logg över kontogränserna. MÄTT värde för 5h/vecka/extra. Innehåller INTE
   resets_at – den härleds (se harled_5h_reset) och märks som HÄRLEDD.
3. Sessionens transkript (.jsonl) – kontextfönstret räknas som
   input + cache_read + cache_creation + output på senaste huvudloops-svaret.
   Samma formel som Claude Codes egen used_percentage (docs: statusline#available-data).

Lägen:
  --statusline   stdin = statusLine-JSON. Skriver auktoritativ snapshot, ekar en statusrad.
  --hook         stdin = hook-JSON. Skriver ut hookSpecificOutput med additionalContext
                 när läget ändrats nog för att vara värt tokens. Annars tyst.
  --show         mänskligt läsbar status till stdout (för ad hoc-koll via Bash).
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

HOME = Path.home()
PLAN_HISTORY = HOME / "Library/Application Support/Claude/plan-usage-history.json"
SNAPSHOT = HOME / ".claude/usage-snapshot.json"
STATE = HOME / ".claude/usage-monitor-state.json"
PROJECTS = HOME / ".claude/projects"

FEM_TIMMAR_MS = 5 * 60 * 60 * 1000
FÄRSKHETSGRÄNS_S = 15 * 60  # plan-usage-history skrivs var 5:e minut när appen lever

# Kontextfönstrets storlek per modell. Uppmätt: session f41aae8c nådde 844k tokens utan
# att kapas, och appens egen ruta visade "/1.0M" – alltså 1M för Opus 5 i desktop.
KONTEXTFÖNSTER = {"claude-opus-5": 1_000_000, "claude-sonnet-5": 1_000_000}
KONTEXTFÖNSTER_STANDARD = 200_000

BUCKET_NAMN = {
    "fh": "5h",
    "sd": "vecka",
    "so": "vecka-Opus",
    "sn": "vecka-Sonnet",
    "om": "vecka-Fable",
    "cw": "vecka-Cowork",
    "oa": "vecka-appar",
    "op": "kampanj",
    "xu": "extra",
}


# ── band: hur allvarligt är läget ──────────────────────────────────────────────
# Band 0 = tyst, 3 = kritiskt. Injektion sker när bandet ÄNDRATS, inte varje gång.

def band_5h(p):
    if p is None:
        return 0
    return 3 if p >= 90 else 2 if p >= 75 else 1 if p >= 60 else 0


def band_kontext(p):
    if p is None:
        return 0
    return 3 if p >= 85 else 2 if p >= 75 else 1 if p >= 60 else 0


def band_vecka(p):
    if p is None:
        return 0
    return 3 if p >= 95 else 2 if p >= 85 else 1 if p >= 70 else 0


# ── batchbeslutet ──────────────────────────────────────────────────────────────
# Ett batch-AVSLUT är inte gratis: dashboarden ska frysas, före/efter-bilder kontrolleras,
# doc-hygien-svepet köras, cacher rensas, servrar startas och länkarna verifieras. Det är
# tiotals minuter arbete. Att stanna när mätaren står på noll är alltså för sent — reserven
# måste dras av innan. Siffran nedan är en UPPSKATTNING, inte en mätning: den bygger på
# avslutssekvensen i webapp-batch-skillen och ska kalibreras mot verkliga avslut.
AVSLUTSRESERV_MIN = 20


def batchbeslut(snap):
    """→ {"läge": "kör"|"ryms"|"avsluta", "skäl": [...], "min_till_stopp": n|None}

    "kör"     – starta nästa post fritt.
    "ryms"    – starta bara en post som hinner bli klar; committa per post.
    "avsluta" – starta INGEN ny post, gå över till batch-avslutande protokoll.
    """
    k = snap["kontext"]["procent"]
    f = snap["fem_timmar"]["procent"]
    prognos = snap["fem_timmar"].get("prognos_min_till_slut")
    reset = snap["fem_timmar"].get("återställs")

    # Återställningen är räddningen, inte hotet: rullar fönstret om innan takten hinner
    # fram till taket blir det aldrig något stopp att planera för.
    till_reset = (reset - time.time()) / 60 if reset else None
    stopp = prognos if (prognos is not None and (till_reset is None or prognos < till_reset)) else None

    skäl = []
    läge = "kör"

    def höj(nytt, text):
        nonlocal läge
        ordning = {"kör": 0, "ryms": 1, "avsluta": 2}
        if ordning[nytt] > ordning[läge]:
            läge = nytt
        skäl.append(text)

    if f is not None and f >= 90:
        höj("avsluta", f"5h på {f} % – taket är inom räckhåll.")
    elif f is not None and f >= 75:
        höj("ryms", f"5h på {f} %.")
    if stopp is not None and stopp <= AVSLUTSRESERV_MIN:
        höj("avsluta", f"I nuvarande takt är 5h slut om ~{round(stopp)} min (PROGNOS) – "
                       f"avslutet självt behöver ~{AVSLUTSRESERV_MIN} min.")
    elif stopp is not None and stopp <= 45:
        höj("ryms", f"I nuvarande takt är 5h slut om ~{round(stopp)} min (PROGNOS).")
    if k is not None and k >= 85:
        höj("avsluta", f"Orkestratorns context på {k} % – den överlever inte ett avslut till.")
    elif k is not None and k >= 75:
        höj("ryms", f"Orkestratorns context på {k} %.")

    return {"läge": läge, "skäl": skäl, "min_till_stopp": round(stopp) if stopp else None}


# ── källa 2: kontogränserna ────────────────────────────────────────────────────

def läs_planhistorik():
    """→ (bucket-procent, ålder i s, härledd 5h-reset epoch-s, minuter till 100 %)"""
    try:
        d = json.loads(PLAN_HISTORY.read_text())
        s = d["samples"]
    except Exception:
        return {}, None, None, None
    if not s:
        return {}, None, None, None
    senast = s[-1]
    ålder = time.time() - senast["t"] / 1000
    return senast.get("u", {}), ålder, härled_5h_reset(s), prognos_5h(s)


def prognos_5h(samples, fönster_min=30):
    """Extrapolerar 5h-förbrukningen rakt fram → minuter tills den är slut.

    Ren linjär framskrivning av den senaste halvtimmens lutning. Det är en PROGNOS,
    inte en mätning: den antar att takten hålls, vilket den inte gör när arbetet byter
    karaktär. Märks därför alltid ut som prognos där den visas.
    """
    nu = time.time() * 1000
    p = [(x["t"], x["u"]["fh"]) for x in samples
         if x.get("u", {}).get("fh") is not None and x["t"] >= nu - fönster_min * 60_000]
    if len(p) < 3:
        return None
    # bara sammanhängande stigning – en återställning i fönstret gör lutningen meningslös
    start = 0
    for i in range(1, len(p)):
        if p[i][1] < p[i - 1][1] - 5:
            start = i
    p = p[start:]
    if len(p) < 3:
        return None
    dt_min = (p[-1][0] - p[0][0]) / 60_000
    dp = p[-1][1] - p[0][1]
    if dt_min <= 0 or dp <= 0:
        return None
    return (100 - p[-1][1]) / (dp / dt_min)


def härled_5h_reset(samples):
    """Femtimmarsfönstret är RULLANDE och ankras vid första meddelandet i fönstret.

    Uppmätt i historiken: när användningen är sammanhängande kedjas fönstren exakt +5h
    (08-01: 00:22, 05:22, 10:22, 15:22, 20:22). Efter en tyst period startar ett nytt
    fönster vid nästa meddelande, och då hamnar återställningen på ett nytt klockslag.

    Vi tar senaste observerade nedgången i fh som fönstrets start och lägger på 5h.
    Upplösningen är historikens samplingsintervall, alltså ±5 min. Returnerar None
    hellre än en gissning när ingen nedgång syns i historiken.
    """
    start = None
    föreg = None
    for x in samples:
        fh = x.get("u", {}).get("fh")
        if föreg is not None and fh is not None and fh < föreg - 5:
            start = x["t"]
        if fh is not None:
            föreg = fh
    if start is None:
        return None
    reset = start + FEM_TIMMAR_MS
    if reset < time.time() * 1000:
        return None  # fönstret har rullat vidare utan att vi sett det – påstå inget
    return reset / 1000


# ── källa 3: kontextfönstret ur transkriptet ───────────────────────────────────

SVANS_BYTE = 4 * 1024 * 1024  # transkript blir 15 MB+; hooken får inte läsa hela filen


def _sista_usage(rader, modell):
    """Bakifrån: första träffen är senaste huvudloops-svaret."""
    for line in reversed(rader):
        if '"usage"' not in line:
            continue
        try:
            o = json.loads(line)
        except Exception:
            continue
        if o.get("isSidechain"):
            continue  # subagenter har eget fönster
        m = o.get("message")
        if not isinstance(m, dict):
            continue
        u = m.get("usage")
        if u:
            return u, (m.get("model") or modell)
    return None, modell


def läs_kontext(transcript_path, model_id=None):
    """→ (använda tokens, fönsterstorlek, procent) eller (None, None, None)"""
    p = Path(transcript_path) if transcript_path else None
    if not p or not p.exists():
        return None, None, None
    senaste = None
    modell = model_id
    try:
        storlek_fil = p.stat().st_size
        with p.open("rb") as f:
            if storlek_fil > SVANS_BYTE:
                f.seek(-SVANS_BYTE, os.SEEK_END)
                f.readline()  # kasta den avhuggna första raden
            rader = f.read().decode("utf-8", "replace").splitlines()
        senaste, modell = _sista_usage(rader, modell)
        if senaste is None and storlek_fil > SVANS_BYTE:
            # inget svar i svansen – fall tillbaka på hela filen
            with p.open(encoding="utf-8", errors="replace") as f:
                senaste, modell = _sista_usage(f.readlines(), modell)
    except Exception:
        return None, None, None
    if not senaste:
        return None, None, None
    använt = (
        senaste.get("input_tokens", 0)
        + senaste.get("cache_read_input_tokens", 0)
        + senaste.get("cache_creation_input_tokens", 0)
        + senaste.get("output_tokens", 0)
    )
    storlek = KONTEXTFÖNSTER.get(modell, KONTEXTFÖNSTER_STANDARD)
    if använt > storlek:  # fel gissad storlek – hellre tyst än falsk procent
        return använt, None, None
    return använt, storlek, round(använt / storlek * 100, 1)


def hitta_transkript(cwd):
    """Reservväg när hooken inte fick transcript_path."""
    if not cwd:
        return None
    katalog = PROJECTS / ("-" + str(cwd).strip("/").replace("/", "-").replace(" ", "-"))
    if not katalog.is_dir():
        return None
    filer = sorted(katalog.glob("*.jsonl"), key=lambda f: f.stat().st_mtime)
    return filer[-1] if filer else None


# ── snapshot ───────────────────────────────────────────────────────────────────

def bygg_snapshot(hook_input=None, statusline_input=None):
    sl = statusline_input or {}
    buckets, ålder, härledd_reset, min_till_slut = läs_planhistorik()

    kontext_pct = kontext_använt = kontext_storlek = None
    kontext_källa = None
    cw = sl.get("context_window") or {}
    if cw.get("used_percentage") is not None:
        kontext_pct = round(float(cw["used_percentage"]), 1)
        kontext_storlek = cw.get("context_window_size")
        kontext_använt = (cw.get("total_input_tokens") or 0) + (cw.get("total_output_tokens") or 0)
        kontext_källa = "statusLine"
    else:
        src = (hook_input or {}).get("transcript_path") or hitta_transkript((hook_input or {}).get("cwd"))
        kontext_använt, kontext_storlek, kontext_pct = läs_kontext(src)
        kontext_källa = "transkript" if kontext_pct is not None else None

    rl = sl.get("rate_limits") or {}
    fh_sl = (rl.get("five_hour") or {})
    sd_sl = (rl.get("seven_day") or {})

    fem_h = fh_sl.get("used_percentage")
    fem_h_källa = "statusLine"
    if fem_h is None:
        fem_h = buckets.get("fh")
        fem_h_källa = "plan-usage-history" if fem_h is not None else None

    vecka = sd_sl.get("used_percentage")
    vecka_källa = "statusLine"
    if vecka is None:
        vecka = buckets.get("sd")
        vecka_källa = "plan-usage-history" if vecka is not None else None

    reset_5h = fh_sl.get("resets_at")
    reset_5h_källa = "statusLine" if reset_5h else ("härledd ±5 min" if härledd_reset else None)
    reset_5h = reset_5h or härledd_reset

    snap = {
        "tid": time.time(),
        "kontext": {
            "procent": kontext_pct,
            "använt": kontext_använt,
            "storlek": kontext_storlek,
            "källa": kontext_källa,
        },
        "fem_timmar": {
            "procent": fem_h,
            "återställs": reset_5h,
            "återställs_källa": reset_5h_källa,
            "prognos_min_till_slut": round(min_till_slut) if min_till_slut is not None else None,
            "källa": fem_h_källa,
        },
        "vecka": {
            "procent": vecka,
            "återställs": sd_sl.get("resets_at"),
            "källa": vecka_källa,
        },
        "övriga_hinkar": {
            BUCKET_NAMN.get(k, k): v for k, v in buckets.items() if k not in ("fh", "sd")
        },
        "kontodata_ålder_s": round(ålder) if ålder is not None else None,
        "kontodata_färsk": (ålder is not None and ålder < FÄRSKHETSGRÄNS_S),
        "modell": (sl.get("model") or {}).get("display_name"),
        "session_id": sl.get("session_id") or (hook_input or {}).get("session_id"),
    }
    snap["batch"] = batchbeslut(snap)
    try:
        SNAPSHOT.write_text(json.dumps(snap, ensure_ascii=False, indent=2))
    except Exception:
        pass
    return snap


# ── formatering ────────────────────────────────────────────────────────────────

def om(epoch_s):
    if not epoch_s:
        return None
    kvar = int(epoch_s - time.time())
    if kvar < 0:
        return None
    return f"{kvar // 3600}h {kvar % 3600 // 60}m" if kvar >= 3600 else f"{kvar // 60}m"


def råd(snap):
    k = snap["kontext"]["procent"]
    f = snap["fem_timmar"]["procent"]
    v = snap["vecka"]["procent"]
    r = []
    p = snap["fem_timmar"].get("prognos_min_till_slut")
    if p is not None and p < 45 and band_5h(f) < 3:
        r.append(f"Prognos: 5h-taket nås om ~{round(p)} min i nuvarande takt – planera pass som ryms, "
                 "eller sänk takten (färre parallella agenter).")
    if band_5h(f) == 3:
        r.append("5h nästan slut: avsluta pågående post, committa, skriv WIP-överlämning NU – starta ingen ny post.")
    elif band_5h(f) == 2:
        r.append("5h högt: kör bara poster som hinner bli klara före återställningen; committa per post.")
    if band_kontext(k) == 3:
        r.append("Kontext nästan fullt: avsluta delen, skriv överlämning och be om ny session.")
    elif band_kontext(k) == 2:
        r.append("Kontext högt: undvik stora filläsningar, lägg tunga läsningar i subagenter.")
    if band_vecka(v) >= 2:
        r.append("Veckogränsen närmar sig: prioritera bara nödvändigt arbete.")
    return r


def formatera(snap, kort=False):
    d = []
    k, f, v = snap["kontext"], snap["fem_timmar"], snap["vecka"]
    if k["procent"] is not None:
        t = f"kontext {k['procent']}%"
        if k["använt"] and k["storlek"]:
            t += f" ({k['använt']//1000}k/{k['storlek']//1000}k)"
        d.append(t)
    if f["procent"] is not None:
        t = f"5h {f['procent']}%"
        if (o := om(f["återställs"])):
            t += f", återställs om {o}"
            if f["återställs_källa"] and "härledd" in f["återställs_källa"]:
                t += " (härlett ±5 min)"
        p = f.get("prognos_min_till_slut")
        kvar_till_reset = (f["återställs"] - time.time()) / 60 if f["återställs"] else None
        if p is not None and (kvar_till_reset is None or p < kvar_till_reset):
            t += f" – men i nuvarande takt slut om ~{round(p)} min (PROGNOS)"
        d.append(t)
    if v["procent"] is not None:
        d.append(f"vecka {v['procent']}%")
    for namn, p in snap["övriga_hinkar"].items():
        if p:
            d.append(f"{namn} {p}%")
    if not snap["kontodata_färsk"] and snap["kontodata_ålder_s"] is not None:
        d.append(f"⚠ kontosiffror {snap['kontodata_ålder_s']//60} min gamla")
    rad = " · ".join(d) if d else "ingen mätdata"
    if kort:
        return rad
    rader = [f"[arbetsbudget] {rad}"]
    rader += [f"  → {x}" for x in råd(snap)]
    return "\n".join(rader)


# ── injektionspolicy: kosta nästan inga tokens ────────────────────────────────

def läs_state():
    try:
        return json.loads(STATE.read_text())
    except Exception:
        return {}


def skriv_state(s):
    try:
        STATE.write_text(json.dumps(s))
    except Exception:
        pass


def ska_injicera(snap, händelse):
    """Alltid vid ny prompt och vid subagent-slut. Under autonomt arbete bara när
    bandet ändrats eller det gått lång tid i ett varningsläge."""
    band = (
        band_kontext(snap["kontext"]["procent"]),
        band_5h(snap["fem_timmar"]["procent"]),
        band_vecka(snap["vecka"]["procent"]),
    )
    st = läs_state()
    tidigare = tuple(st.get("band", (0, 0, 0)))
    sedan = time.time() - st.get("senast", 0)
    högsta = max(band)

    if händelse in ("UserPromptSubmit", "SubagentStop", "SessionStart"):
        beslut = True
    elif band != tidigare:
        beslut = True
    elif högsta >= 3 and sedan > 300:
        beslut = True
    elif högsta == 2 and sedan > 900:
        beslut = True
    else:
        beslut = False

    if beslut:
        skriv_state({"band": list(band), "senast": time.time()})
    return beslut


def main():
    läge = sys.argv[1] if len(sys.argv) > 1 else "--show"

    if läge == "--statusline":
        try:
            sl = json.load(sys.stdin)
        except Exception:
            sl = {}
        snap = bygg_snapshot(statusline_input=sl)
        print(formatera(snap, kort=True))
        return

    if läge == "--hook":
        try:
            hi = json.load(sys.stdin)
        except Exception:
            hi = {}
        händelse = hi.get("hook_event_name", "")
        snap = bygg_snapshot(hook_input=hi)
        if not ska_injicera(snap, händelse):
            return
        if snap["kontext"]["procent"] is None and snap["fem_timmar"]["procent"] is None:
            return
        if händelse == "SessionStart":
            print(formatera(snap))  # SessionStart lägger ren stdout i kontexten
            return
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": händelse,
                "additionalContext": formatera(snap),
            }
        }, ensure_ascii=False))
        return

    hi = {"cwd": os.getcwd()}
    snap = bygg_snapshot(hook_input=hi)
    print(formatera(snap))


if __name__ == "__main__":
    main()
