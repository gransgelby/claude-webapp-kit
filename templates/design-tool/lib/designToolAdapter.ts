'use client'
// ─────────────────────────────────────────────────────────────────────────────
// DESIGNTOOL-ADAPTER — DEN ENDA SÖMMEN mot din app.  ⚠️ WIRA DE 3 SÖMMARNA NEDAN.
// ─────────────────────────────────────────────────────────────────────────────
// DesignTool-komponenterna importerar ALLT app-specifikt HÄRIFRÅN (aldrig direkt
// mot din backend). Den här filen levereras med fungerande localStorage-default
// så verktyget kör direkt i preview — byt sedan mot din riktiga persistens/gate.
//
// Sömmar att wira:
//   1) GRID           — din vys grid-config (kolumner + gap-token).
//   2) admin-gate      — getAuthStatus(): visa verktyget bara för de som får.
//   3) note-persistens — saveDesignNote/listDesignNotes/deleteDesignNote.
//
// Token-prefix + storage-namespace ligger i ./design/dtConfig.
// Launcher-bussen ligger i ./designToolBus (app-oberoende, rör inte).

import { DEFAULT_GRID, type GridConfig } from './pageGrid'

// ── SÖM 1: GRID ──────────────────────────────────────────────────────────────
// Peka på din vys grid-config. Default = kitets 12-kol-grid. Om din app har en
// egen `lib/gridConfig.ts`, re-exportera den här i stället:
//   export { GRID } from './gridConfig'
export const GRID: GridConfig = DEFAULT_GRID

// ── SÖM 2: ADMIN-GATE ────────────────────────────────────────────────────────
// DesignTool renderar bara när tier === 'admin'. Koppla din egen auth här.
// Default: 'admin' i dev, annars 'anon' (byt mot ett riktigt anrop i prod).
export interface AuthStatus { tier: 'admin' | 'anon' | string }
export async function getAuthStatus(): Promise<AuthStatus> {
  // TODO(app): ersätt med din riktiga auth-check, t.ex.:
  //   const r = await fetch('/api/auth/status'); return r.json()
  const dev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production'
  return { tier: dev ? 'admin' : 'anon' }
}

// ── SÖM 3: NOTE-PERSISTENS ───────────────────────────────────────────────────
// Där sparade designförslag hamnar. Default: localStorage (räcker för preview +
// solo-bruk). Byt mot din backend/GCS/DB genom att implementera de tre
// funktionerna nedan. Formen (DesignNote) är stabil — rör den inte.
export type DesignNote = {
  id: string
  kind: 'style' | 'comment' | 'layout' | 'tokens'
  page?: string
  theme?: string
  mode?: string
  viewport?: { w: number; h: number; dpr?: number }
  design_id?: string
  selector?: string
  label?: string
  rect?: { x: number; y: number; w: number; h: number }
  near_text?: string
  changes?: Record<string, { from?: string; to?: string }>
  layout?: { cols: number; gapVar?: string; page?: string; areas: Array<{ key: string; label?: string; colStart: number; span: number; row: number; hidden?: boolean }> }
  tokens?: Record<string, { from?: string; to?: string }>
  comment?: string
  created_at: string
}

const NOTES_KEY = 'designtool.notes.v1'

function readLocal(): DesignNote[] {
  if (typeof localStorage === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '[]') as DesignNote[] } catch { return [] }
}
function writeLocal(notes: DesignNote[]): void {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)) } catch { /* privat-läge */ }
}

export async function saveDesignNote(note: Record<string, unknown>): Promise<{ ok: boolean; id?: string }> {
  // TODO(app): POST till din backend i stället. Default: localStorage.
  const id = String(note.id || `n_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`)
  const entry = { created_at: new Date().toISOString(), ...note, id } as DesignNote
  writeLocal([entry, ...readLocal().filter((n) => n.id !== id)])
  return { ok: true, id }
}

export async function listDesignNotes(): Promise<DesignNote[]> {
  // TODO(app): GET från din backend. Default: localStorage.
  return readLocal()
}

export async function deleteDesignNote(id: string): Promise<boolean> {
  // TODO(app): DELETE mot din backend. Default: localStorage.
  writeLocal(readLocal().filter((n) => n.id !== id))
  return true
}
