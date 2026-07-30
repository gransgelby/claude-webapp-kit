#!/usr/bin/env python3
"""SessionStart-kort: projektets grundfakta på en skärm, gratis.

Varför: en ny session börjar annars med att man läser sig fram till var man är. Kortet
svarar på det innan första frågan hinner ställas — och den enskilt viktigaste raden är
NÄSTA, som lyfts ur Project_state.md så att man kan börja bygga direkt.

Krav som styrt utformningen:
  * SNABBT. Hela kortet ska kosta millisekunder, inte sekunder — annars betalar man för
    det vid varje sessionsstart. Därför bara filsystem och git, aldrig en testkörning.
    (Uppmätt på ett 39k-raders projekt: ~0,2 s inklusive python-uppstart.)
  * TYST NÄR DET INTE PASSAR. Saknas Project_state.md är projektet inte doc-roll-styrt
    och kortet skriver ingenting alls. Varje enskild siffra som inte går att räkna
    utelämnas i stället för att gissas.
  * INGA PÅHITTADE TAL. Arbetstid finns det ingen källa till och redovisas därför inte.
    Commits, aktiva dagar och spann är mätbara; timmar är det inte.

Konfiguras valfritt med .claude/projektkort.json i projektet:
    {"namn": "App-projektet", "undertitel": "kort beskrivning av appen",
     "kod": ["lib","components","app"], "krav": "docs/kravspec.md"}
"""
import json
import os
import unicodedata
import re
import subprocess
import sys

BREDD = 79
ROT = os.getcwd()


def sh(*args):
    try:
        r = subprocess.run(args, cwd=ROT, capture_output=True, text=True, timeout=4)
        return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        return ""


def finns(p):
    return os.path.exists(os.path.join(ROT, p))


def rader(paths):
    """Radantal över en fillista. Läser binärt och räknar radbrytningar — snabbast."""
    n = 0
    for p in paths:
        try:
            with open(p, "rb") as f:
                n += f.read().count(b"\n")
        except Exception:
            pass
    return n


def filer(dirs, test=False):
    ut = []
    for d in dirs:
        full = os.path.join(ROT, d)
        if not os.path.isdir(full):
            continue
        for base, _, fs in os.walk(full):
            if "node_modules" in base or "/." in base:
                continue
            for f in fs:
                if not f.endswith((".ts", ".tsx", ".js", ".jsx", ".py", ".css")):
                    continue
                ärtest = ".test." in f or ".spec." in f
                if ärtest == test:
                    ut.append(os.path.join(base, f))
    return ut


def tal(n):
    """Svensk tusenavskiljare med hårt mellanslag, så talet inte bryts på radslut."""
    return f"{n:,}".replace(",", " ")


def main():
    if not finns("Project_state.md"):
        return  # inte ett doc-roll-projekt: skriv ingenting

    cfg = {}
    try:
        with open(os.path.join(ROT, ".claude/projektkort.json"), encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception:
        pass

    namn = cfg.get("namn") or os.path.basename(ROT)
    under = cfg.get("undertitel", "")
    koddirs = cfg.get("kod") or ["lib", "components", "app", "src"]
    kravfil = cfg.get("krav") or "docs/kravspec.md"

    kod = rader(filer(koddirs, test=False))
    test = rader(filer(koddirs, test=True))
    docfiler = [
        os.path.join(ROT, p)
        for p in ("App_vision.md", "Project_state.md", "Reference.md", "Backlog.md",
                  "Project_history.md", "CLAUDE.md")
        if finns(p)
    ]
    doc = rader(docfiler)

    kravrader = kravid = 0
    if finns(kravfil):
        try:
            with open(os.path.join(ROT, kravfil), encoding="utf-8") as f:
                txt = f.read()
            kravrader = txt.count("\n")
            # Båda skrivsätten räknas, unikt — samma metod doc-hygiene föreskriver.
            kravid = len(set(re.findall(r"[Kk]rav ([A-ZÄÖÅ]+\d+)", txt)))
        except Exception:
            pass

    ps = ""
    try:
        with open(os.path.join(ROT, "Project_state.md"), encoding="utf-8") as f:
            ps = f.read()
    except Exception:
        pass

    # Tusenavskiljare kan vara mellanslag eller hårt mellanslag — annars blir 2 254 till 254.
    m = re.search(r"([\d  ]{1,9}\d)\s*tester i\s*(\d+)\s*filer", ps)
    tester = (re.sub(r"[\s ]", "", m.group(1)), m.group(2)) if m else None

    nästa = ""
    for rad in ps.splitlines():
        if "NÄSTA" in rad:
            nästa = re.sub(r"[*`>#\[\]]|^[-\s]+|👉", "", rad).strip()
            break

    commits = sh("git", "rev-list", "--count", "HEAD")
    första = sh("git", "log", "--reverse", "--format=%ad", "--date=short")
    första = första.splitlines()[0] if första else ""
    dagar = sh("git", "log", "--format=%ad", "--date=short")
    dagar = len(set(dagar.splitlines())) if dagar else 0
    gren = sh("git", "rev-parse", "--abbrev-ref", "HEAD")
    smutsig = bool(sh("git", "status", "--porcelain"))
    senast = sh("git", "log", "-1", "--format=%s")

    bug = ide = 0
    try:
        with open(os.path.join(ROT, "Backlog.md"), encoding="utf-8") as f:
            b = f.read()
        bug = len(re.findall(r"^- \*\*B\d+", b, re.M))
        ide = len(re.findall(r"^- \*\*I\d+", b, re.M))
    except Exception:
        pass

    # ── Layout. Padding räknas i TECKEN, inte bytes — annars spricker ramen av å, ä, ö.
    def bredd(s):
        """Visuell bredd. Emoji och CJK tar två kolumner men räknas som ett tecken av
        len() — utan detta spricker ramen på raden med 👉."""
        return sum(2 if unicodedata.east_asian_width(c) in "WF" else 1 for c in s)

    def rad(inner=""):
        return "│ " + inner + " " * max(0, BREDD - 4 - bredd(inner)) + " │"

    def kapa(s, n):
        if bredd(s) <= n:
            return s
        ut = ""
        for c in s:
            if bredd(ut) + bredd(c) > n - 1:
                break
            ut += c
        return ut + "…"

    topp = f"─ {namn.upper()} "
    if under:
        h = f"┌{topp}" + "─" * max(0, BREDD - 2 - bredd(topp) - bredd(under) - 3) + f" {under} ┐"
    else:
        h = "┌" + topp + "─" * max(0, BREDD - 2 - bredd(topp)) + "┐"

    ut = [h]
    if nästa:
        ut.append(rad("👉 " + kapa(nästa, BREDD - 8)))
        ut.append("├" + "─" * (BREDD - 2) + "┤")

    kol = []
    if kod:
        kol.append((f"{tal(kod)} rader kod", f"{tal(test)} rader test" if test else ""))
    v3 = []
    if tester:
        v3.append(f"{tal(int(tester[0]))} tester i {tester[1]} filer")
    if kravid:
        v3.append(f"{kravid} krav-ID")
    if kravrader:
        v3.append(f"{tal(kravrader)} rader kravspec")
    v4 = []
    if commits:
        v4.append(f"{commits} commits")
    if dagar:
        v4.append(f"{dagar} aktiva dagar")
    if första:
        v4.append(f"startad {första}")

    vänster = [x for pair in kol for x in pair if x] + ([f"{tal(doc)} rader dok"] if doc else [])
    if bug or ide:
        v3.append(f"{bug} buggar · {ide} idéer i kö")

    for i in range(max(len(vänster), len(v3), len(v4))):
        a = vänster[i] if i < len(vänster) else ""
        b_ = v3[i] if i < len(v3) else ""
        c = v4[i] if i < len(v4) else ""
        ut.append(rad(f"{a:<24}{b_:<27}{c}"))

    if gren:
        ut.append("├" + "─" * (BREDD - 2) + "┤")
        st = f"{gren} · {'ÄNDRINGAR OCOMMITTADE' if smutsig else 'rent träd'}"
        if senast:
            st += " · senast: " + kapa(senast, BREDD - 12 - len(st))
        ut.append(rad(kapa(st, BREDD - 4)))
    ut.append("└" + "─" * (BREDD - 2) + "┘")
    sys.stdout.write("\n".join(ut) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass  # ett kort som kraschar får aldrig blockera en session
