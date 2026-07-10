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

/** SPARA-knapp (C4) – varm röd-orange accent så viktiga sparningar sticker ut mot
 *  det lugna verktyget. En primär-accent per vy: använd bara för Spara-handlingar
 *  (Spara layout, Spara förslag, Spara i Avsluta-dialogen). Hover ger C3-slöjan. */
export function dtSaveBtn(disabled = false): CSSProperties {
  return {
    padding: '6px 12px', borderRadius: 'var(--dt-radius-sm)', fontSize: 'var(--dt-text-sm)',
    fontFamily: 'var(--dt-font)', cursor: disabled ? 'default' : 'pointer', fontWeight: 600, lineHeight: 1.2,
    border: '1px solid var(--dt-save)',
    background: 'var(--dt-save)',
    color: 'var(--dt-save-contrast)',
    opacity: disabled ? 0.6 : 1,
    transition: 'background var(--dt-dur-fast) var(--dt-spring), border-color var(--dt-dur-fast) var(--dt-spring), transform var(--dt-dur-fast) var(--dt-spring-bounce)',
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

/** Textinmatning/textarea. */
export function dtInput(): CSSProperties {
  return {
    width: '100%', background: 'var(--dt-surface-2)', border: '1px solid var(--dt-border)',
    borderRadius: 'var(--dt-radius-sm)', color: 'var(--dt-text)', fontSize: 'var(--dt-text-sm)',
    fontFamily: 'var(--dt-font)', padding: '6px 8px', outline: 'none',
  }
}
