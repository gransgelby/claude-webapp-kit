// App-oberoende konfiguration för DesignTool: vilket token-prefix appens
// design-tokens har, och ett storage-namespace för verktygets egna localStorage-
// nycklar. Byt värdena om din app avviker; verktyget stylar sig ALLTID med sina
// egna `--dt-*` (rör inte dessa) — detta gäller bara vilka tokens det LÄSER/
// REDIGERAR (data) och var det lagrar sitt eget UI-tillstånd.
export interface DtConfig {
  /** Prefix på appens färg-/design-tokens som verktyget läser & redigerar. */
  tokenPrefix: string
  /** Namespace för verktygets egna localStorage-nycklar (undviker krock). */
  storagePrefix: string
}

export const DT_CONFIG: DtConfig = {
  tokenPrefix: '--c-',
  storagePrefix: 'designtool',
}

/** Bygg en namespacead localStorage-nyckel, t.ex. dtKey('layout.v1'). */
export function dtKey(suffix: string): string {
  return `${DT_CONFIG.storagePrefix}.${suffix}`
}
