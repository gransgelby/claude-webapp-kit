'use client'
// <PageGrid> — app-agnostisk grid-container-primitiv + grid-config-kontrakt.
//
// Detta är KÄLLAN till en vys rutnät. Lägg en vy på grid genom att wrappa dess
// kort i <PageGrid> och ge varje kort en `col-span-*`/`gridColumn`. Konsumenter
// (och DesignTool) LÄSER kolumnantalet LIVE ur DOM:en via `data-grid-cols` +
// CSS-variabeln på containern — de hårdkodar ALDRIG gridtypen. Byt `columns`
// (12 → 16 → 24 …) → hela vyn + verktyget följer med.
//
// Default: 12 kolumner (kitets rekommendation för nya appar). Gap läses ur en
// spacing-token (CSS-variabel) så rutnätets luft är del av token-lagret.
import type { CSSProperties, ReactNode } from 'react'

export interface GridConfig {
  /** Antal kolumner i vyns rutnät. Kitets default för nya appar: 12. */
  columns: number
  /** CSS-variabel (namn inkl. `--`) som bär grid-gutter (gap). Läses av CSS + verktyget. */
  gapVar: string
}

/** Kitets default-grid för en ny app: 12 kolumner, gap ur en spacing-token. */
export const DEFAULT_GRID: GridConfig = {
  columns: 12,
  gapVar: '--space-grid-gutter',
}

/**
 * Inline-style för en grid-container driven av en GridConfig: `display:grid`,
 * `repeat(columns, minmax(0,1fr))` och gap ur gap-token-variabeln. Sätt även
 * `data-grid-cols={cfg.columns}` på samma element (gör <PageGrid> automatiskt)
 * så verktyget kan avläsa kolumnantalet utan att gissa.
 */
export function gridContainerStyle(cfg: GridConfig = DEFAULT_GRID): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${cfg.columns}, minmax(0, 1fr))`,
    gap: `var(${cfg.gapVar})`,
  }
}

export interface PageGridProps {
  /** Grid-config (kolumner + gap-token). Default: DEFAULT_GRID (12 kol). */
  config?: GridConfig
  className?: string
  style?: CSSProperties
  /** HTML-element att rendera som (default `div`). */
  as?: keyof JSX.IntrinsicElements
  children?: ReactNode
}

/**
 * Grid-container-primitiv. Wrappa en vys kort i denna och ge varje kort ett
 * `col-span-*`. Exponerar `data-grid-cols` + gap-CSS-var så DesignTool kan
 * introspektera rutnätet live.
 *
 *   <PageGrid>
 *     <Card className="col-span-8" />
 *     <Card className="col-span-4" />
 *   </PageGrid>
 */
export function PageGrid({ config = DEFAULT_GRID, className, style, as = 'div', children }: PageGridProps) {
  const Tag = as as any
  return (
    <Tag
      data-grid-cols={config.columns}
      style={{ ...gridContainerStyle(config), ...style }}
      className={className}
    >
      {children}
    </Tag>
  )
}
