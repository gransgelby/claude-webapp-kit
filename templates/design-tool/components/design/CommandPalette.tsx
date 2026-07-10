'use client'
// Kommandopalett (⌘K) för DesignTool-shellen (Post 2 · lyx-lager, KRAV).
// Ett riktigt sök/kör-gränssnitt över verktygets kommandon: fuzzy-filter,
// tangentbords-navigation (↑/↓/Enter/Esc), sektioner. Stylas enbart med `--dt-*`.
import { useEffect, useMemo, useRef, useState } from 'react'

export interface Command {
  id: string
  title: string
  /** Kort hint till höger (t.ex. genväg eller aktivt tillstånd). */
  hint?: string
  /** Extra sökord (utöver titeln). */
  keywords?: string
  /** Sektionsrubrik i listan. */
  section?: string
  /** Ikon-glyf (emoji/tecken) till vänster. */
  glyph?: string
  /** Markerad som aktiv (t.ex. valt chrome-tema). */
  active?: boolean
  run: () => void
}

function score(cmd: Command, q: string): number {
  if (!q) return 1
  const hay = `${cmd.title} ${cmd.keywords ?? ''} ${cmd.section ?? ''}`.toLowerCase()
  const needle = q.toLowerCase()
  if (hay.includes(needle)) return 2 + (cmd.title.toLowerCase().startsWith(needle) ? 1 : 0)
  // Subsekvens-match (fuzzy): alla tecken i ordning.
  let i = 0
  for (const ch of hay) { if (ch === needle[i]) i++; if (i === needle.length) return 1 }
  return 0
}

export default function CommandPalette({
  open, commands, onClose,
}: { open: boolean; commands: Command[]; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const results = useMemo(() => {
    return commands
      .map((c) => ({ c, s: score(c, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c)
  }, [commands, q])

  useEffect(() => { if (open) { setQ(''); setSel(0); requestAnimationFrame(() => inputRef.current?.focus()) } }, [open])
  useEffect(() => { setSel(0) }, [q])
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('[data-sel="1"]')?.scrollIntoView({ block: 'nearest' })
  }, [sel, open, results.length])

  if (!open) return null

  const run = (c?: Command) => { if (c) { onClose(); c.run() } }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[sel]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  let lastSection = ''
  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 30, display: 'flex',
        alignItems: 'flex-start', justifyContent: 'center', paddingTop: '14vh',
        background: 'var(--dt-scrim)', backdropFilter: 'blur(2px)',
        animation: 'dtFade var(--dt-dur-fast) var(--dt-spring)',
      }}
    >
      <div
        data-dt-palette
        style={{
          width: 'min(560px, 92vw)', maxHeight: '64vh', display: 'flex', flexDirection: 'column',
          background: 'var(--dt-surface-raised)', backdropFilter: 'var(--dt-blur)',
          border: '1px solid var(--dt-border-strong)', borderRadius: 'var(--dt-radius-lg)',
          boxShadow: 'var(--dt-shadow-lg), var(--dt-glow)', overflow: 'hidden',
          animation: 'dtPop var(--dt-dur) var(--dt-spring-bounce)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--dt-space-3)', padding: 'var(--dt-space-3) var(--dt-space-4)', borderBottom: '1px solid var(--dt-border)' }}>
          <span aria-hidden style={{ color: 'var(--dt-accent)', fontSize: 'var(--dt-text-lg)' }}>⌘</span>
          <input
            ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Sök kommando…" spellCheck={false}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--dt-text)', fontSize: 'var(--dt-text-lg)', fontFamily: 'var(--dt-font)',
            }}
          />
          <kbd style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)', border: '1px solid var(--dt-border)', borderRadius: 'var(--dt-radius-sm)', padding: '2px 6px' }}>esc</kbd>
        </div>
        <div ref={listRef} style={{ overflowY: 'auto', padding: 'var(--dt-space-2)' }}>
          {results.length === 0 && (
            <div style={{ padding: 'var(--dt-space-4)', color: 'var(--dt-text-mute)', fontSize: 'var(--dt-text-sm)', textAlign: 'center' }}>Inga kommandon matchar “{q}”.</div>
          )}
          {results.map((c, i) => {
            const showSection = c.section && c.section !== lastSection
            if (c.section) lastSection = c.section
            return (
              <div key={c.id}>
                {showSection && (
                  <div style={{ padding: '10px 10px 4px', fontSize: 'var(--dt-text-xs)', letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--dt-text-mute)' }}>{c.section}</div>
                )}
                <button
                  type="button" data-sel={i === sel ? '1' : '0'}
                  onMouseEnter={() => setSel(i)} onClick={() => run(c)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--dt-space-3)',
                    padding: 'var(--dt-space-2) var(--dt-space-3)', border: 'none', textAlign: 'left',
                    borderRadius: 'var(--dt-radius-sm)', cursor: 'pointer',
                    background: i === sel ? 'var(--dt-accent-weak)' : 'transparent',
                    color: 'var(--dt-text)', fontFamily: 'var(--dt-font)', fontSize: 'var(--dt-text-md)',
                    transition: 'background var(--dt-dur-fast) var(--dt-spring)',
                  }}
                >
                  <span aria-hidden style={{ width: 18, textAlign: 'center', color: c.active ? 'var(--dt-accent)' : 'var(--dt-text-dim)' }}>{c.glyph ?? '›'}</span>
                  <span style={{ flex: 1 }}>{c.title}</span>
                  {c.active && <span aria-hidden style={{ color: 'var(--dt-accent)', fontSize: 'var(--dt-text-sm)' }}>●</span>}
                  {c.hint && <span style={{ color: 'var(--dt-text-mute)', fontSize: 'var(--dt-text-xs)' }}>{c.hint}</span>}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
