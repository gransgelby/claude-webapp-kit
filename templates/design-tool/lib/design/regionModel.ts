// Generisk visuell-logisk AUTO-UPPDELNING (Design mode v2 · A1 – "Nordstjärnan").
//
// Givet en renderad sida (vilken som helst, i vilken app som helst) delas den upp
// i en NÄSTLAD hierarki av visuellt distinkta regioner – så som en människa
// uppfattar dem. INGEN hårdkodning mot någon specifik sida: heuristiken bygger
// enbart på generella visuella/semantiska signaler:
//
//   • KORT-LIKA behållare: egen bakgrund (≠ ärvd), ram på ≥3 sidor eller skugga,
//     och tillräckligt stora ("substantiella").
//   • SEMANTISKA sektioner: section/article/nav/… eller container-roller.
//   • UPPREPADE grid-/flex-barn: en rad-container vars substantiella barn saknar
//     egen visuell separation blir "slot"-regioner (ger redigerbar struktur där
//     inget kortlikt finns, t.ex. en hero-yta med vänsterdel + foto).
//   • TRIVIALA WRAPPERS hoppas över: transparenta mellanlager utan egen visuell
//     identitet lyfts igenom (hoisting), och en region vars enda barn täcker
//     nästan hela ytan slås ihop med barnet (merge).
//
// Arkitektur som elementModel.ts: den RENA kärnan (buildRegionTree m.fl.) opererar
// på `VisualNode`-träd (plain data, inga DOM-referenser) → billig, deterministisk,
// enhets-testad i node-miljö. DOM-läsningen är isolerad längst ned (readVisualTree/
// readRegions) och gör inget annat än att bygga VisualNode-träd ur riktiga element.
import { placementFromGeometry, type GridGeom } from './gridModel'

// ── Typer ────────────────────────────────────────────────────────────────────

export interface Rect { x: number; y: number; w: number; h: number }

/** Rent, DOM-fritt sammandrag av ett renderat element (det heuristiken ser). */
export interface VisualNode {
  /** Index i element-tabellen (DOM-läsaren fyller i; syntetiska träd sätter unika tal). */
  ref: number
  tag: string
  rect: Rect
  /** Egen bakgrund (computed background-color om synlig, annars null). */
  bgColor: string | null
  /** Egen bakgrundsbild/gradient. */
  bgImage: boolean
  /** Antal ram-sidor med synlig ram (0–4). ≥3 ⇒ "box-ram" (inte bara en divider). */
  borderSides: number
  shadow: boolean
  display: string
  /** flex-direction börjar med "row" (bara meningsfullt när display är flex). */
  flexRow: boolean
  /** Antal kolumnspår om display är grid, annars 0. */
  gridCols: number
  colGap: number
  padLeft: number
  padRight: number
  position: string
  /** Interaktiv kontroll (button/a/input/…) – aldrig en region i sig. */
  interactive: boolean
  /** Semantisk sektionstagg eller container-roll. */
  semantic: boolean
  children: VisualNode[]
}

/** En region i den nästlade hierarkin (refererar VisualNode via ref). */
export interface RegionNode {
  /** Regionens element (yttersta vid merge). Unikt → duger som id. */
  ref: number
  /** Innersta merge-elementet (det visuella kortet) – bäst för egenskaps-panelen. */
  innerRef: number
  /** Elementet som ska flyttas/storleksändras (yttersta EXKLUSIVA wrappern). */
  anchorRef: number
  /** Ankarets riktiga layout-förälder (scope-containern som styr mekaniken). */
  scopeRef: number
  kind: 'visual' | 'slot' | 'locked'
  rect: Rect
  depth: number
  children: RegionNode[]
}

export interface RegionOpts {
  /** Minsta bredd/höjd/area (px/px²) för att ett element ska räknas som region. */
  minW: number
  minH: number
  minArea: number
  /** Enda-barnet-täcker-så-här-mycket ⇒ slå ihop region + barn (trivial wrapper). */
  mergeCoverage: number
  /** Minsta slot-bredd som andel av rad-containerns bredd. */
  minSlotWFrac: number
  /** Max regions-djup (skydd mot patologiska träd). */
  maxDepth: number
  /** DOM-läsarens gränser. */
  maxDomDepth: number
  maxNodes: number
  /** Interaktiva element ignoreras om inte arean ≥ interactiveAreaFactor × minArea
   *  (stora klickbara kort ska ändå bli regioner). */
  interactiveAreaFactor: number
}

export const DEFAULT_REGION_OPTS: RegionOpts = {
  minW: 64,
  minH: 40,
  minArea: 20000,
  mergeCoverage: 0.7,
  minSlotWFrac: 0.12,
  maxDepth: 5,
  maxDomDepth: 14,
  maxNodes: 4000,
  interactiveAreaFactor: 4,
}

const SEMANTIC_TAGS = new Set([
  'section', 'article', 'nav', 'aside', 'header', 'footer', 'main', 'form', 'figure', 'table',
])
const SEMANTIC_ROLES = new Set([
  'region', 'toolbar', 'navigation', 'form', 'dialog', 'banner', 'complementary', 'main', 'search',
])
const INTERACTIVE_TAGS = new Set([
  'button', 'a', 'input', 'select', 'textarea', 'label', 'summary', 'option',
])

// ── Rena predikat ────────────────────────────────────────────────────────────

export const rectArea = (r: Rect): number => Math.max(0, r.w) * Math.max(0, r.h)

/** Andel av `outer` som `inner` täcker (ren area-kvot). */
export function coverage(inner: Rect, outer: Rect): number {
  const o = rectArea(outer)
  return o <= 0 ? 0 : rectArea(inner) / o
}

/** Stor nog att uppfattas som en egen yta (inte chip/pill/knapp/rad). */
export function isSubstantial(n: VisualNode, o: RegionOpts = DEFAULT_REGION_OPTS): boolean {
  return n.rect.w >= o.minW && n.rect.h >= o.minH && rectArea(n.rect) >= o.minArea
}

/** Egen synlig separation från omgivningen: bakgrund som skiljer sig från den
 *  ärvda, box-ram (≥3 sidor – en ensam border-bottom är en divider, ingen låda)
 *  eller skugga. `inheritedBg` = närmaste förfaders egna bakgrund (eller null). */
export function isVisuallySeparated(n: VisualNode, inheritedBg: string | null): boolean {
  if (n.bgImage) return true
  if (n.bgColor && n.bgColor !== inheritedBg) return true
  if (n.borderSides >= 3) return true
  if (n.shadow) return true
  return false
}

/** Kandidat till region: substantiell OCH (visuellt separerad ELLER semantisk). */
export function isRegionCandidate(n: VisualNode, inheritedBg: string | null, o: RegionOpts = DEFAULT_REGION_OPTS): boolean {
  if (!isSubstantial(n, o)) return false
  return isVisuallySeparated(n, inheritedBg) || n.semantic
}

/** Ligger elementet i dokumentflödet (absolute/fixed-lager är overlays, inte layout)? */
export function isInFlow(n: VisualNode): boolean {
  return n.position !== 'absolute' && n.position !== 'fixed'
}

/** Rad-container: grid med ≥2 kolumnspår, eller flex-rad. */
export function isRowContainer(n: VisualNode): boolean {
  if (n.display === 'grid' || n.display === 'inline-grid') return n.gridCols >= 2
  if (n.display === 'flex' || n.display === 'inline-flex') return n.flexRow
  return false
}

// ── Mekanik-hjälpare (för drag/resize-applicering i verktyget) ───────────────

export type RegionMech = 'grid' | 'flex' | 'flow'

/** Vilken layout-mekanik regionens scope-container erbjuder. */
export function scopeMech(scope: VisualNode): RegionMech {
  if (scope.display === 'grid' || scope.display === 'inline-grid') return 'grid'
  if (scope.display === 'flex' || scope.display === 'inline-flex') return 'flex'
  return 'flow'
}

/**
 * Lokal grid-placering för en region inom sin scope-container, RENT ur geometri.
 * Grid-scope → containerns riktiga spår; flex/flow → virtuellt `virtualCols`-raster.
 * Återanvänder gridModel.placementFromGeometry (v1:s enhets-testade mappning).
 */
export function localPlacement(
  r: Rect,
  scope: VisualNode,
  virtualCols = 12,
): { colStart: number; span: number; cols: number } {
  const grid = scopeMech(scope) === 'grid' && scope.gridCols >= 1
  const cols = grid ? scope.gridCols : virtualCols
  const inner = Math.max(1, scope.rect.w - scope.padLeft - scope.padRight)
  const gap = grid ? scope.colGap : 0
  const trackW = (inner - (cols - 1) * gap) / cols
  const geom: GridGeom = { cols, trackW, gap, originX: scope.rect.x + scope.padLeft }
  const { colStart, span } = placementFromGeometry(r.x, r.w, geom)
  return { colStart, span, cols }
}

// ── Kärnan: bygg regionshierarkin ────────────────────────────────────────────

interface Unit {
  node: VisualNode
  kind: 'visual' | 'slot' | 'locked'
  /** Wrapper-stigen från sök-roten NER till noden (inkl. noden själv). */
  path: VisualNode[]
}

/**
 * Hitta regionens DIREKTA under-regioner ("units"):
 *   (1) samla visuella/semantiska kandidater genom transparenta wrappers (hoisting),
 *   (2) sticky-band på rot-nivå blir låsta regioner,
 *   (3) slot-pass: den första rad-containern med ≥2 substantiella barn ger varje
 *       kandidat-fritt barn en slot-region (upprepade grid-/flex-barn).
 */
function findUnits(
  node: VisualNode,
  inheritedBg: string | null,
  atRoot: boolean,
  allowSlots: boolean,
  o: RegionOpts,
): Unit[] {
  const cands: Unit[] = []
  const bgOf = (n: VisualNode, inh: string | null) => n.bgColor ?? inh

  const collect = (n: VisualNode, inh: string | null, path: VisualNode[]) => {
    for (const c of n.children) {
      if (!isInFlow(c)) continue // overlays (abs/fixed) är inte layout-regioner
      if (c.interactive && rectArea(c.rect) < o.minArea * o.interactiveAreaFactor) continue
      const p = [...path, c]
      if (atRoot && c.position === 'sticky' && isSubstantial(c, o)) {
        cands.push({ node: c, kind: 'locked', path: p })
        continue
      }
      if (isRegionCandidate(c, inh, o)) {
        cands.push({ node: c, kind: 'visual', path: p })
        continue // barnens regioner hittas när vi rekurserar in i kandidaten
      }
      collect(c, bgOf(c, inh), p)
    }
  }
  collect(node, bgOf(node, inheritedBg), [])

  // (3) Slot-pass: gå ner genom enkel-barns-kedjor till första nivån med ≥2
  //     substantiella barn; är den en RAD-container får kandidat-fria barn slots.
  const slots: Unit[] = []
  if (allowSlots) {
    let cur = node
    const curPath: VisualNode[] = []
    for (let i = 0; i < o.maxDomDepth; i++) {
      const flow = cur.children.filter((c) => isInFlow(c) && !c.interactive)
      const subs = flow.filter((c) => isSubstantial(c, o))
      if (subs.length >= 2) {
        if (isRowContainer(cur)) {
          for (const c of subs) {
            const isCand = cands.some((k) => k.node === c)
            const holdsCand = cands.some((k) => k.path.includes(c))
            if (!isCand && !holdsCand && c.rect.w >= o.minSlotWFrac * cur.rect.w) {
              slots.push({ node: c, kind: 'slot', path: [...curPath, c] })
            }
          }
        }
        break
      }
      if (subs.length === 1 && !cands.some((k) => k.node === subs[0])) {
        curPath.push(subs[0]); cur = subs[0]; continue
      }
      break
    }
  }

  const units = [...cands, ...slots]
  // Dokumentordning (uppifrån-vänster) i stället för "kandidater först".
  units.sort((a, b) => (a.node.rect.y - b.node.rect.y) || (a.node.rect.x - b.node.rect.x))
  return units
}

/** Yttersta EXKLUSIVA wrappern för en unit (wrappern närmast sök-roten som inte
 *  innehåller någon ANNAN unit) + dess scope (wrapperns förälder). */
function anchorAndScope(u: Unit, all: Unit[], searchRoot: VisualNode): { anchor: VisualNode; scope: VisualNode } {
  for (let i = 0; i < u.path.length; i++) {
    const w = u.path[i]
    const shared = all.some((v) => v !== u && (v.path.includes(w) || v.node === w))
    if (!shared) {
      return { anchor: w, scope: i === 0 ? searchRoot : u.path[i - 1] }
    }
  }
  const last = u.path[u.path.length - 1] ?? u.node
  return { anchor: last, scope: u.path.length > 1 ? u.path[u.path.length - 2] : searchRoot }
}

function toRegion(u: Unit, all: Unit[], searchRoot: VisualNode, inheritedBg: string | null, depth: number, o: RegionOpts): RegionNode {
  const { anchor, scope } = anchorAndScope(u, all, searchRoot)
  let innerRef = u.node.ref
  let children: RegionNode[] = []
  if (u.kind !== 'locked' && depth < o.maxDepth) {
    children = regionChildren(u.node, u.node.bgColor ?? inheritedBg, false, u.kind !== 'slot', depth + 1, o)
    // MERGE: ett enda visuellt barn som täcker nästan hela regionen = trivialt
    // skal (t.ex. section-wrapper runt ett kort, kortets inre bakgrundslager).
    let inner = u.node
    while (
      children.length === 1 && children[0].kind === 'visual' &&
      coverage(children[0].rect, inner.rect) >= o.mergeCoverage
    ) {
      innerRef = children[0].innerRef
      const merged = children[0]
      children = merged.children
      inner = { ...inner, rect: merged.rect } // fortsätt täcknings-jämförelsen inåt
    }
  }
  return {
    ref: u.node.ref,
    innerRef,
    anchorRef: anchor.ref,
    scopeRef: scope.ref,
    kind: u.kind,
    rect: u.node.rect,
    depth,
    children,
  }
}

function regionChildren(node: VisualNode, inheritedBg: string | null, atRoot: boolean, allowSlots: boolean, depth: number, o: RegionOpts): RegionNode[] {
  const units = findUnits(node, inheritedBg, atRoot, allowSlots, o)
  return units.map((u) => toRegion(u, units, node, inheritedBg, depth, o))
}

/**
 * Bygg hela den nästlade regionshierarkin för en sida (ren kärna).
 * Roten är alltid en region; dess barn är sidans topp-band/sektioner.
 */
export function buildRegionTree(root: VisualNode, opts: Partial<RegionOpts> = {}): RegionNode {
  const o = { ...DEFAULT_REGION_OPTS, ...opts }
  return {
    ref: root.ref,
    innerRef: root.ref,
    anchorRef: root.ref,
    scopeRef: root.ref,
    kind: 'visual',
    rect: root.rect,
    depth: 0,
    children: regionChildren(root, root.bgColor, true, true, 1, o),
  }
}

/** Platta ut trädet (för räkning/loggning/tester). */
export function flattenRegions(r: RegionNode): RegionNode[] {
  return [r, ...r.children.flatMap(flattenRegions)]
}

// ── DOM-läsning (isolerad – bygger VisualNode-träd ur riktiga element) ────────

const BG_ALPHA_RE = /rgba?\(\s*[\d.]+[\s,]+[\d.]+[\s,]+[\d.]+(?:[\s,/]+([\d.]+%?))?\s*\)/

function visibleBgColor(cs: CSSStyleDeclaration): string | null {
  const bg = cs.backgroundColor
  if (!bg || bg === 'transparent') return null
  const m = BG_ALPHA_RE.exec(bg)
  if (m && m[1] !== undefined) {
    const a = m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1])
    if (a < 0.03) return null
  }
  return bg
}

function countBorderSides(cs: CSSStyleDeclaration): number {
  let n = 0
  for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
    const w = parseFloat(cs[`border${side}Width` as 'borderTopWidth'] || '0')
    const st = cs[`border${side}Style` as 'borderTopStyle']
    if (w > 0 && st !== 'none' && st !== 'hidden') n++
  }
  return n
}

/**
 * Läs det renderade under-trädet till ett rent VisualNode-träd. `els[ref]` mappar
 * tillbaka till elementen och `nodes[ref]` till noderna (för scope-geometri).
 * Hoppar över DesignTools egen DOM ([data-design-tool]) och osynliga/
 * mikroskopiska element.
 */
export function readVisualTree(rootEl: Element, opts: Partial<RegionOpts> = {}): { root: VisualNode; els: Element[]; nodes: VisualNode[] } | null {
  const o = { ...DEFAULT_REGION_OPTS, ...opts }
  const els: Element[] = []
  const nodes: VisualNode[] = []
  const read = (el: Element, depth: number): VisualNode | null => {
    if (depth > o.maxDomDepth || els.length >= o.maxNodes) return null
    if (el.hasAttribute('data-design-tool') || el.hasAttribute('data-dt-designmode')) return null
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return null
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') < 0.05) return null
    const tag = el.tagName.toLowerCase()
    const role = el.getAttribute('role')
    const ref = els.length
    els.push(el)
    const node: VisualNode = {
      ref,
      tag,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      bgColor: visibleBgColor(cs),
      bgImage: !!cs.backgroundImage && cs.backgroundImage !== 'none',
      borderSides: countBorderSides(cs),
      shadow: !!cs.boxShadow && cs.boxShadow !== 'none',
      display: cs.display,
      flexRow: (cs.flexDirection || '').startsWith('row'),
      gridCols: cs.display.includes('grid') ? (cs.gridTemplateColumns || '').split(' ').filter(Boolean).length : 0,
      colGap: parseFloat(cs.columnGap || '0') || 0,
      padLeft: parseFloat(cs.paddingLeft || '0') || 0,
      padRight: parseFloat(cs.paddingRight || '0') || 0,
      position: cs.position,
      interactive: INTERACTIVE_TAGS.has(tag),
      semantic: SEMANTIC_TAGS.has(tag) || (!!role && SEMANTIC_ROLES.has(role)),
      children: [],
    }
    nodes[ref] = node
    for (const c of Array.from(el.children)) {
      const n = read(c, depth + 1)
      if (n) node.children.push(n)
    }
    return node
  }
  const root = read(rootEl, 0)
  return root ? { root, els, nodes } : null
}

/** Bekvämlighet: läs + bygg i ett svep. Returnerar träd + element-/nod-tabeller. */
export function readRegions(rootEl: Element, opts: Partial<RegionOpts> = {}): { tree: RegionNode; els: Element[]; nodes: VisualNode[] } | null {
  const read = readVisualTree(rootEl, opts)
  if (!read) return null
  return { tree: buildRegionTree(read.root, opts), els: read.els, nodes: read.nodes }
}
