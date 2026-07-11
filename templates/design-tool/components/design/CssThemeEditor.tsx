// V15 · CSS-tema-editorn – KOMPAKT kontrollpanel som TWEAKAR mål-sidans faktiska
// tema-tokens (INTE bygger nya teman). App-AGNOSTISK: får token-listan enumererad
// generiskt ur DEN sidans stylesheets (se lib/design/cssTweaks.ts) → surfar precis
// de `--*`-tokens sidan definierar, aldrig en hårdkodad lista. Rent presentationellt:
// state/historik/spara ägs av DesignModeShell; färger → färgfält, längder/radier →
// slider+fält, fonter → väljare. Editorns EGEN chrome hålls i Precision-temaparet
// (--dt-*); bara mål-sidans tokens (color/radius/length/font/…) redigeras.

import { useMemo } from 'react'
import {
  parseLength, lengthSliderMax, colorTokenHex, formatColorLikeOriginal, boxEditKey,
  type ThemeToken, type TweakKind, type BoxObservation,
} from '@/lib/design/cssTweaks'
import { dtGhostBtn, dtInput, dtRangeFill } from './dtStyles'

type Props = {
  tokens: ThemeToken[]
  overrides: Record<string, string>
  onChange: (name: string, value: string) => void
  onReset: (name: string) => void
  onResetAll: () => void
  /** W21: token-namn → antal `var()`-referenser på sidan (spridning). */
  spread?: Record<string, number>
  /** W18: kontextuella egenskaper inom en dragen ruta (null = visa hela temat). */
  box?: BoxObservation[] | null
  /** Antal element som rutan täckte (för rubriken). */
  boxElementCount?: number
  /** Rensa ruta-filtret → tillbaka till hela temat. */
  onClearBox?: () => void
  /** R7: element-scopade ruta-ändringar (editKey → aktuellt värde). */
  boxScoped?: Record<string, string>
  /** R7: redigera en ruta-egenskap ELEMENT-SCOPAT (bara rutans element, ej global token). */
  onBoxChange?: (obs: BoxObservation, value: string) => void
  /** R7: återställ en scopad ruta-ändring. */
  onBoxReset?: (obs: BoxObservation) => void
}

const KIND_LABEL: Record<TweakKind, string> = {
  color: 'Färger',
  radius: 'Rundade hörn',
  length: 'Mått & avstånd',
  font: 'Typsnitt',
  number: 'Tal',
  shadow: 'Skuggor',
  other: 'Övrigt',
}
// W20: kort svensk förklaring per avsnitt (så grupperingen känns begriplig).
const KIND_DESC: Record<TweakKind, string> = {
  color: 'Bakgrunder, text, ramar och accenter.',
  radius: 'Hur rundade hörnen är på kort, knappar och rutor.',
  length: 'Padding, marginaler, gap och textstorlekar.',
  font: 'Typsnitt för brödtext och rubriker.',
  number: 'Numeriska temavärden (t.ex. textvikt).',
  shadow: 'Skuggor och elevation.',
  other: 'Övriga temavärden.',
}
const KIND_ORDER: TweakKind[] = ['color', 'radius', 'length', 'font', 'number', 'shadow', 'other']

/** W21: liten spridnings-etikett ("används på N ställen"). */
function SpreadTag({ n }: { n: number | undefined }) {
  if (!n || n <= 0) return null
  const word = n === 1 ? 'ställe' : 'ställen'
  return (
    <span title={`Detta värde/token används på ${n} ${word} i sidans CSS`} style={{ fontSize: 10, color: 'var(--dt-text-mute)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
      {n} {word}
    </span>
  )
}

const FONT_SUGGESTIONS = [
  'system-ui, sans-serif', 'ui-sans-serif, system-ui, sans-serif',
  'Georgia, serif', 'ui-serif, Georgia, serif', 'ui-monospace, SFMono-Regular, monospace',
  'Menlo, monospace', 'Inter, system-ui, sans-serif',
]

export default function CssThemeEditor({ tokens, overrides, onChange, onReset, onResetAll, spread, box, boxElementCount, onClearBox, boxScoped, onBoxChange, onBoxReset }: Props) {
  const groups = useMemo(() => {
    const m = new Map<TweakKind, ThemeToken[]>()
    for (const t of tokens) { const g = m.get(t.kind) ?? []; g.push(t); m.set(t.kind, g) }
    return KIND_ORDER.filter((k) => m.has(k)).map((k) => ({ kind: k, list: m.get(k)! }))
  }, [tokens])
  const dirtyCount = Object.keys(overrides).length
  const effective = (t: ThemeToken) => overrides[t.name] ?? t.value

  // W18/W19 + R7: ruta-läge – visa BARA egenskaperna i rutan, och redigera dem
  // ELEMENT-SCOPAT: en ändring skrivs inline på rutans element (via onBoxChange), inte
  // på den globala token:en → den stannar i rutan. Räckvidden görs glasklar i rubriken.
  if (box) {
    const scoped = boxScoped ?? {}
    return (
      <div
        data-dt-native-scroll
        data-dt-css-editor
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', background: 'var(--dt-surface)', color: 'var(--dt-text)', fontFamily: 'var(--dt-font)' }}
      >
        <div style={{ padding: 'var(--dt-space-3) var(--dt-space-4)', borderBottom: '1px solid var(--dt-border)', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--dt-accent)' }}>Ändrar bara i rutan</strong>
            {typeof boxElementCount === 'number' && boxElementCount > 0 ? <> · <strong style={{ color: 'var(--dt-text-dim)', fontVariantNumeric: 'tabular-nums' }}>{boxElementCount}</strong> element</> : null}
            {' '}· <strong style={{ color: 'var(--dt-text-dim)', fontVariantNumeric: 'tabular-nums' }}>{box.length}</strong> egenskaper.
            {' '}<span style={{ opacity: 0.85 }}>Ändringen skrivs på just de här elementen, inte på hela temat.</span>
          </span>
          {onClearBox && (
            <button type="button" onClick={onClearBox} style={{ ...dtGhostBtn(), padding: '2px 8px', marginLeft: 'auto' }}>Ändra temat globalt i stället</button>
          )}
        </div>

        {box.length === 0 && (
          <div style={{ padding: 'var(--dt-space-5)', fontSize: 'var(--dt-text-sm)', color: 'var(--dt-text-mute)' }}>
            Inga egenskaper hittades i rutan. Dra en ruta över ett kort eller en text.
          </div>
        )}

        <datalist id="dt-font-suggestions">
          {FONT_SUGGESTIONS.map((f) => <option key={f} value={f} />)}
        </datalist>

        <section style={{ padding: 'var(--dt-space-2) var(--dt-space-4) var(--dt-space-4)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--dt-space-2)' }}>
          {box.map((obs, i) => {
            const editKey = boxEditKey(obs.prop, obs.value)
            const dirty = editKey in scoped
            const val = scoped[editKey] ?? obs.value
            const tokenName = obs.tokens[0]
            // Alla rad-ändringar går element-scopat (onBoxChange). name-argumentet till
            // Control/color-inputen är irrelevant i scoped-läge – vi routar via obs.
            const change = (v: string) => onBoxChange?.(obs, v)
            return (
              <div key={obs.prop + i} title={tokenName || obs.prop} style={rowBox(dirty)}>
                {obs.kind === 'color' && (
                  <input
                    type="color" aria-label={obs.label} value={colorTokenHex(val)}
                    onChange={(e) => change(e.target.value)}
                    style={{ width: 26, height: 26, padding: 0, border: '1px solid var(--dt-border-strong)', borderRadius: 'var(--dt-radius-sm)', background: 'none', cursor: 'pointer', flex: 'none' }}
                  />
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'space-between' }}>
                    <span style={labelStyle}>{obs.label}</span>
                    <span title={`${obs.count} element i rutan har den här egenskapen`} style={{ fontSize: 10, color: 'var(--dt-text-mute)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {obs.count} i rutan
                    </span>
                  </div>
                  {obs.kind === 'color'
                    ? <div style={valStyle}>{val}</div>
                    : <Control kind={obs.kind} name={editKey} value={val} onChange={(_, v) => change(v)} />}
                </div>
                {dirty && onBoxReset && <ResetDot onClick={() => onBoxReset(obs)} />}
              </div>
            )
          })}
        </section>
      </div>
    )
  }

  return (
    <div
      data-dt-native-scroll
      data-dt-css-editor
      style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', background: 'var(--dt-surface)', color: 'var(--dt-text)', fontFamily: 'var(--dt-font)' }}
    >
      {/* Intro-remsa: förklarar app-agnostiken + antal tokens som surfats. */}
      <div style={{ padding: 'var(--dt-space-3) var(--dt-space-4)', borderBottom: '1px solid var(--dt-border)', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--dt-text-xs)', color: 'var(--dt-text-mute)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--dt-text-dim)' }}>Ändrar temat globalt.</strong> <strong style={{ color: 'var(--dt-text-dim)', fontVariantNumeric: 'tabular-nums' }}>{tokens.length}</strong> tema-tokens lästa ur sidans CSS.
          {dirtyCount > 0 && <> · <strong style={{ color: 'var(--dt-accent)', fontVariantNumeric: 'tabular-nums' }}>{dirtyCount}</strong> ändrade</>}
          {' '}<span style={{ opacity: 0.85 }}>Dra en ruta över sidan för att i stället ändra bara där.</span>
        </span>
        {dirtyCount > 0 && (
          <button type="button" onClick={onResetAll} style={{ ...dtGhostBtn(), padding: '2px 8px', marginLeft: 'auto' }}>Återställ alla</button>
        )}
      </div>

      {tokens.length === 0 && (
        <div style={{ padding: 'var(--dt-space-5)', fontSize: 'var(--dt-text-sm)', color: 'var(--dt-text-mute)' }}>
          Inga tema-tokens hittades i sidans stylesheets.
        </div>
      )}

      <datalist id="dt-font-suggestions">
        {FONT_SUGGESTIONS.map((f) => <option key={f} value={f} />)}
      </datalist>

      {groups.map(({ kind, list }) => (
        <section key={kind} style={{ padding: 'var(--dt-space-2) var(--dt-space-4) var(--dt-space-3)' }}>
          <h3 style={{ fontSize: 'var(--dt-text-xs)', fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--dt-text-mute)', margin: '0 0 2px' }}>
            {KIND_LABEL[kind]} <span style={{ fontWeight: 400, opacity: 0.7 }}>· {list.length}</span>
          </h3>
          <p style={{ margin: '0 0 var(--dt-space-2)', fontSize: 10, color: 'var(--dt-text-mute)', opacity: 0.85 }}>{KIND_DESC[kind]}</p>
          {kind === 'color' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 'var(--dt-space-2)' }}>
              {list.map((t) => {
                const val = effective(t)
                const dirty = t.name in overrides
                return (
                  <div key={t.name} title={t.name} style={rowBox(dirty)}>
                    <input
                      type="color"
                      aria-label={t.name}
                      value={colorTokenHex(val)}
                      onChange={(e) => onChange(t.name, formatColorLikeOriginal(t.value, e.target.value))}
                      style={{ width: 26, height: 26, padding: 0, border: '1px solid var(--dt-border-strong)', borderRadius: 'var(--dt-radius-sm)', background: 'none', cursor: 'pointer', flex: 'none' }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'space-between' }}>
                        <div style={nameStyle}>{shortName(t.name)}</div>
                        <SpreadTag n={spread?.[t.name]} />
                      </div>
                      <div style={valStyle}>{val}</div>
                    </div>
                    {dirty && <ResetDot onClick={() => onReset(t.name)} />}
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--dt-space-2)' }}>
              {list.map((t) => {
                const val = effective(t)
                const dirty = t.name in overrides
                return (
                  <div key={t.name} title={t.name} style={rowBox(dirty)}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'space-between' }}>
                        <div style={nameStyle}>{shortName(t.name)}</div>
                        <SpreadTag n={spread?.[t.name]} />
                      </div>
                      <Control kind={kind} name={t.name} value={val} onChange={onChange} />
                    </div>
                    {dirty && <ResetDot onClick={() => onReset(t.name)} />}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}

/** Kontroll per token-klass: slider+fält för mått/radie, väljare för font, fält annars. */
function Control({ kind, name, value, onChange }: { kind: TweakKind; name: string; value: string; onChange: (n: string, v: string) => void }) {
  if (kind === 'length' || kind === 'radius') {
    const p = parseLength(value)
    if (p) {
      const max = lengthSliderMax(p.unit)
      const step = p.unit === 'rem' || p.unit === 'em' ? 0.05 : 1
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <input
            type="range" min={0} max={Math.max(max, p.num)} step={step} value={p.num}
            aria-label={name}
            onChange={(e) => onChange(name, `${e.target.value}${p.unit}`)}
            style={{ flex: 1, minWidth: 0, ...dtRangeFill(p.num, 0, Math.max(max, p.num)) }}
          />
          <input
            type="text" value={value}
            onChange={(e) => onChange(name, e.target.value)}
            style={{ ...dtInput(), width: 62, padding: '3px 6px', fontVariantNumeric: 'tabular-nums', flex: 'none' }}
          />
        </div>
      )
    }
  }
  if (kind === 'font') {
    return (
      <input
        type="text" value={value} list="dt-font-suggestions"
        aria-label={name}
        onChange={(e) => onChange(name, e.target.value)}
        style={{ ...dtInput(), padding: '3px 6px', marginTop: 3 }}
      />
    )
  }
  if (kind === 'number') {
    return (
      <input
        type="number" value={value} step="any"
        aria-label={name}
        onChange={(e) => onChange(name, e.target.value)}
        style={{ ...dtInput(), padding: '3px 6px', marginTop: 3, fontVariantNumeric: 'tabular-nums', width: 90 }}
      />
    )
  }
  // shadow / other → rå textredigering
  return (
    <input
      type="text" value={value}
      aria-label={name}
      onChange={(e) => onChange(name, e.target.value)}
      style={{ ...dtInput(), padding: '3px 6px', marginTop: 3, fontFamily: 'var(--dt-font-mono)', fontSize: 'var(--dt-text-xs)' }}
    />
  )
}

function ResetDot({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} title="Återställ till original" aria-label="Återställ token"
      style={{ flex: 'none', width: 18, height: 18, borderRadius: '50%', border: '1px solid var(--dt-border-strong)', background: 'var(--dt-accent-weak)', color: 'var(--dt-accent)', cursor: 'pointer', fontSize: 11, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >↺</button>
  )
}

function rowBox(dirty: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
    borderRadius: 'var(--dt-radius-sm)', border: '1px solid ' + (dirty ? 'var(--dt-accent)' : 'var(--dt-border)'),
    background: dirty ? 'var(--dt-accent-weak)' : 'var(--dt-surface-2)', minWidth: 0,
  }
}
const nameStyle: React.CSSProperties = { fontSize: 'var(--dt-text-xs)', fontWeight: 600, color: 'var(--dt-text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--dt-font-mono)' }
// W18: svensk förklaring (ej mono – läsbar mening, inte token-namn).
const labelStyle: React.CSSProperties = { fontSize: 'var(--dt-text-xs)', fontWeight: 600, color: 'var(--dt-text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const valStyle: React.CSSProperties = { fontSize: 10, color: 'var(--dt-text-mute)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums' }

/** Kortare visningsnamn: droppar ledande `--` men behåller resten (fullt i title). */
function shortName(name: string): string {
  return name.replace(/^--/, '')
}
