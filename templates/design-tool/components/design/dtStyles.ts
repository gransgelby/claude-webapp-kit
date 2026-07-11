// Delade stil-byggare för DesignTool-shellen – ALLA värden ur `--dt-*` (Post 2).
// Inga appfärger (`--c-*`), inga hårdkodade hex. Håller HMI:t konsekvent.
import type { CSSProperties } from 'react'

/** Primär/aktiv knapp (accent-fylld när `on`). */
export function dtBtn(on = false): CSSProperties {
  return {
    padding: '6px 12px', borderRadius: 'var(--dt-radius-sm)', fontSize: 'var(--dt-text-sm)',
    fontFamily: 'var(--dt-font)', cursor: 'pointer', fontWeight: 600, lineHeight: 1.2,
    border: `1px solid ${on ? 'var(--dt-border-strong)' : 'var(--dt-border)'}`,
    background: on ? 'var(--dt-accent)' : 'var(--dt-accent-weak)',
    color: on ? 'var(--dt-accent-contrast)' : 'var(--dt-text)',
    transition: 'background var(--dt-dur-fast) var(--dt-spring), border-color var(--dt-dur-fast) var(--dt-spring), transform var(--dt-dur-fast) var(--dt-spring-bounce)',
  }
}

/** SPARA-knapp (W24) – POSITIV/primär handling → dämpad grön (INTE varnande röd-
 *  orange; W24 vände semantiken så rödorange = varning). Använd för Spara-handlingar
 *  (Spara layout, Spara förslag, Spara i Avsluta-dialogen). Hover ger C3-slöjan.
 *
 *  W25 · `active` = det finns något att spara (osparade ändringar). När `active`
 *  fylls knappen med den positiva grönfärgen (självsäker "spara nu"); när INAKTIV
 *  (rent, inget att spara) vilar den som en dämpad neutral knapp. Dialogernas
 *  Spara-knappar är alltid `active` (default) – bara topbar-knappen speglar dirty. */
export function dtSaveBtn(disabled = false, active = true): CSSProperties {
  return {
    padding: '6px 12px', borderRadius: 'var(--dt-radius-sm)', fontSize: 'var(--dt-text-sm)',
    fontFamily: 'var(--dt-font)', cursor: disabled ? 'default' : 'pointer', fontWeight: 600, lineHeight: 1.2,
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    border: `1px solid ${active ? 'var(--dt-positive)' : 'var(--dt-border)'}`,
    background: active ? 'var(--dt-positive)' : 'transparent',
    color: active ? 'var(--dt-positive-contrast)' : 'var(--dt-text-dim)',
    opacity: disabled ? 0.6 : 1,
    transition: 'background var(--dt-dur-fast) var(--dt-spring), border-color var(--dt-dur-fast) var(--dt-spring), color var(--dt-dur-fast) var(--dt-spring), transform var(--dt-dur-fast) var(--dt-spring-bounce)',
  }
}

/** VARNINGS-/destruktiv knapp (W24) – för handlingar som kastar bort arbete/raderar
 *  (Spara inte, Förkasta). Bränd-orange varningsfärg som en dämpad ghost (färgad
 *  text + linje + svag fyllning), valör-anpassad för AA. Signalerar "detta ångrar
 *  du kanske" utan att skrika lika högt som en solid primärknapp. */
export function dtDangerBtn(disabled = false): CSSProperties {
  return {
    padding: '6px 12px', borderRadius: 'var(--dt-radius-sm)', fontSize: 'var(--dt-text-sm)',
    fontFamily: 'var(--dt-font)', cursor: disabled ? 'default' : 'pointer', fontWeight: 600, lineHeight: 1.2,
    border: '1px solid var(--dt-danger-line)',
    background: 'var(--dt-danger-weak)',
    color: 'var(--dt-danger-text)',
    opacity: disabled ? 0.6 : 1,
    transition: 'background var(--dt-dur-fast) var(--dt-spring), border-color var(--dt-dur-fast) var(--dt-spring)',
  }
}

/** Sekundär/ghost-knapp (transparent, accent-linje när aktiv). */
export function dtGhostBtn(on = false, disabled = false): CSSProperties {
  return {
    padding: '6px 12px', borderRadius: 'var(--dt-radius-sm)', fontSize: 'var(--dt-text-sm)',
    fontFamily: 'var(--dt-font)', cursor: disabled ? 'default' : 'pointer', fontWeight: 500, lineHeight: 1.2,
    border: `1px solid ${on ? 'var(--dt-border-strong)' : 'var(--dt-border)'}`,
    background: on ? 'var(--dt-accent-weak)' : 'transparent',
    color: disabled ? 'var(--dt-text-mute)' : 'var(--dt-text-dim)',
    opacity: disabled ? 0.6 : 1,
    transition: 'background var(--dt-dur-fast) var(--dt-spring), color var(--dt-dur-fast) var(--dt-spring)',
  }
}

/** B5 · Accent-fylld aktiv del på en `<input type=range>`. Sätter `--dt-range-fill`
 *  (procent av spåret som fylls till VÄNSTER om thumben) som den globala range-CSS:en
 *  (KEYFRAMES i DesignToolShell) läser. Spreada i sliderns `style`. */
export function dtRangeFill(value: number, min: number, max: number): CSSProperties {
  const span = max - min
  const pct = span > 0 ? Math.min(100, Math.max(0, ((value - min) / span) * 100)) : 0
  return { ['--dt-range-fill' as string]: `${pct}%` } as CSSProperties
}

/** W14 · Kort-behållare för verktygsytans sektioner (Element/Rutt/Kommentarer).
 *  Lyft yta med topp-högdager + lager-skugga → sektionerna läser som fristående
 *  paneler i en bred kontroll-tavla. `strong` = accent-ram (aktiv/vald sektion). */
export function dtCard(strong = false): CSSProperties {
  return {
    background: 'var(--dt-surface-solid)',
    border: `1px solid ${strong ? 'var(--dt-border-strong)' : 'var(--dt-border)'}`,
    borderRadius: 'var(--dt-radius-lg)',
    boxShadow: strong ? 'var(--dt-inner-hi), var(--dt-shadow), var(--dt-glow)' : 'var(--dt-inner-hi), var(--dt-shadow)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  }
}

/** W14 · Kort-huvud: ikon-chip + spärrad titel + höger-hint. Fast rytm mellan sektioner. */
export function dtCardHead(): CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 'var(--dt-space-2)',
    padding: 'var(--dt-space-2) var(--dt-space-3)',
    borderBottom: '1px solid var(--dt-border)', background: 'var(--dt-surface-2)', flex: 'none',
  }
}

/** W14 · Fyrkantigt ikon-chip i kort-huvudet (accent-tonat). */
export function dtIconChip(): CSSProperties {
  return {
    width: 26, height: 26, flex: 'none', display: 'grid', placeItems: 'center',
    borderRadius: 'var(--dt-radius-sm)', fontSize: 14,
    background: 'var(--dt-accent-weak)', color: 'var(--dt-accent)', border: '1px solid var(--dt-accent-line)',
  }
}

/** W14 · Spärrad sektionstitel (precisions-typografi). */
export function dtCardTitle(): CSSProperties {
  return { fontSize: 'var(--dt-text-md)', fontWeight: 700, letterSpacing: 'var(--dt-track-heading)', color: 'var(--dt-text)' }
}

/** W14 · Diskret höger-hint i kort-huvudet. */
export function dtCardHint(): CSSProperties {
  return { marginLeft: 'auto', fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)', letterSpacing: 'var(--dt-track-label)' }
}

/** W14 · Kort-kropp (innehållets padding). */
export function dtCardBody(): CSSProperties {
  return { padding: 'var(--dt-space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--dt-space-2)' }
}

/** Textinmatning/textarea. */
export function dtInput(): CSSProperties {
  return {
    width: '100%', background: 'var(--dt-surface-2)', border: '1px solid var(--dt-border)',
    borderRadius: 'var(--dt-radius-sm)', color: 'var(--dt-text)', fontSize: 'var(--dt-text-sm)',
    fontFamily: 'var(--dt-font)', padding: '6px 8px', outline: 'none',
  }
}
