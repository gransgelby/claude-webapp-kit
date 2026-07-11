'use client'
// PW2 · B5 · Glidande segment-växlare (app-agnostisk verktygs-chrome).
//
// En återanvändbar segment-kontroll med en MJUKT GLIDANDE thumb i stället för hård
// växling. Bärande princip ("alltid snabbt"): valet registreras OMEDELBART – onChange
// körs synkront i click, React sätter aktivt state direkt – och thumben glider bara
// som BEKRÄFTELSE (translate-övergång ≤ --dt-dur-fast ~150ms, avbrytbar). Vid
// prefers-reduced-motion nollas --dt-dur-fast → thumben hoppar (ingen väntan).
//
// Lika breda segment (grid 1fr-kolumner) → thumben = 1 segmentbredd, translateX(i*100%)
// landar exakt på segment i utan mätning. Stylas UTESLUTANDE med --dt-* (Precision).
import type { CSSProperties, ReactNode } from 'react'

export interface DtSegOption {
  value: string
  label: ReactNode
  title?: string
}

export function DtSegmented({
  options, value, onChange, ariaLabel, tablist = false,
}: {
  options: DtSegOption[]
  value: string
  onChange: (value: string) => void
  ariaLabel?: string
  /** Sätt true för role="tablist"/role="tab"/aria-selected (flik-semantik). */
  tablist?: boolean
}) {
  const n = Math.max(1, options.length)
  const idx = Math.max(0, options.findIndex((o) => o.value === value))

  return (
    <div
      role={tablist ? 'tablist' : undefined}
      aria-label={ariaLabel}
      style={{
        position: 'relative', display: 'grid', gridAutoFlow: 'column',
        gridAutoColumns: '1fr', padding: 2, background: 'var(--dt-surface-2)',
        borderRadius: 'var(--dt-radius)', border: '1px solid var(--dt-border)',
        isolation: 'isolate',
      }}
    >
      {/* Glidande thumb (bekräftar valet – gate:ar aldrig input). */}
      <span
        aria-hidden
        data-dt-seg-thumb
        style={{
          position: 'absolute', top: 2, bottom: 2, left: 2,
          width: `calc((100% - 4px) / ${n})`,
          transform: `translateX(${idx * 100}%)`,
          background: 'var(--dt-accent-weak)', border: '1px solid var(--dt-border-strong)',
          borderRadius: 'var(--dt-radius-sm)', boxShadow: 'var(--dt-inner-hi)',
          transition: 'transform var(--dt-dur-fast) var(--dt-spring)',
          pointerEvents: 'none', zIndex: 0,
        }}
      />
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role={tablist ? 'tab' : undefined}
            aria-selected={tablist ? on : undefined}
            title={o.title}
            onClick={() => onChange(o.value)}
            style={segItem(on)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function segItem(on: boolean): CSSProperties {
  return {
    position: 'relative', zIndex: 1, padding: '3px 9px', fontSize: 'var(--dt-text-xs)',
    fontWeight: 600, cursor: 'pointer', border: 'none', background: 'transparent',
    borderRadius: 'var(--dt-radius-sm)', whiteSpace: 'nowrap', lineHeight: 1.2,
    fontFamily: 'var(--dt-font)', letterSpacing: 'var(--dt-track-label)',
    color: on ? 'var(--dt-accent)' : 'var(--dt-text-dim)',
    // Bara färg-övergången (snabb bekräftelse); thumben bär rörelsen.
    transition: 'color var(--dt-dur-fast) var(--dt-spring)',
  }
}
