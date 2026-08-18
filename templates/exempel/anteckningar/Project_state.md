# Var projektet står – Receptappen

> 💬 **EXEMPEL.** Så här kan filen se ut när den är ifylld — jämför med den tomma mallen i
> `templates/project-skeleton/Project_state.md`.

> **Roll:** *var vi är.* Läses vid varje ny session → hålls kort.

---

## Nuläge (uppdaterad 2026-08-18)

Appen fungerar och används av familjen sedan förra veckan. Man kan spara recept, se dem som
kort i en lista och söka bland dem. Sex recept ligger inne.

Senaste omgången ("Operation Kokbok", fyra punkter) gjorde listan användbar: kort i stället
för rader, sökfält, och en genomgång av färger och avstånd. Rapporten från den körningen
ligger kvar och går att öppna igen.

Nästa steg är inte bestämt. Två idéer väntar i `Backlog.md`.

---

## 👉 Snabbstart för en ny session

**Så här kör du appen:** öppna `index.html` direkt i webbläsaren — det behövs ingen server,
appen är tre filer utan beroenden.

**Huvudflöden:** spara ett recept (formuläret överst) · bläddra i listan · söka fram ett
recept med sökfältet.

**Var saker ligger:** `index.html` är hela sidan, `app.js` sköter sparande och sökning,
`style.css` bär färger och avstånd som variabler överst i filen.

**Recepten sparas** i webbläsarens eget minne på den dator de skrevs in — de följer alltså
inte med mellan telefon och dator. Det är ett känt val, inte en bugg (se `Backlog.md`).
