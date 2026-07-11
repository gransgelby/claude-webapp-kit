// V14 · beforeunload-skydd (Tema M, Review 3). GENERELLT/app-agnostiskt: ingen
// hårdkodad selektor och ingen koppling till en viss sida – anroparen injicerar
// sin egen dirty-signal. Kompletterar den IN-APP Avsluta-dialogen (B6/R11), som
// bara täcker verktygets EGET avslut ("Avsluta Design mode"): detta täcker det
// verktyget inte kan fånga in-app – att webbläsaren själv river sidan (stäng
// flik/fönster, navigera bort, reload). Där finns bara ETT verktyg: webbläsarens
// NATIVE "vill du lämna sidan utan att spara?"-bekräftelse via `beforeunload`
// (den kan inte stylas – och det är rätt: bara den fångar hård navigering).
import { useEffect, useRef } from 'react'

/** Minsta event-form vi behöver av ett beforeunload-event (för ren, DOM-fri test). */
export interface BeforeUnloadLike {
  preventDefault: () => void
  returnValue: string | boolean
}

/** Ren logik: aktivera webbläsarens "lämna utan att spara?"-bekräftelse på ett
 *  beforeunload-liknande event OM det finns osparade ändringar. Returnerar `true`
 *  om guarden aktiverades (för test/observerbarhet). Inga ändringar ⇒ ingen prompt
 *  (annars irriterande vid varje reload). */
export function guardBeforeUnload(event: BeforeUnloadLike, dirty: boolean): boolean {
  if (!dirty) return false
  // preventDefault är den moderna signalen; returnValue-sättningen krävs alltjämt
  // av äldre/Chromium-webbläsare för att prompten ska visas.
  event.preventDefault()
  event.returnValue = ''
  return true
}

/** React-hook: registrera EN beforeunload-lyssnare som visar webbläsarens native
 *  bekräftelse när `isDirty()` returnerar sant. `isDirty` läses via ref → lyssnaren
 *  registreras exakt en gång och nollas på unmount (ingen läcka, ingen kvarvarande
 *  prompt när verktyget stängts). App-agnostiskt: dirty-signalen ägs av anroparen. */
export function useUnsavedGuard(isDirty: () => boolean): void {
  const ref = useRef(isDirty)
  ref.current = isDirty
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => { guardBeforeUnload(e, ref.current()) }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])
}
