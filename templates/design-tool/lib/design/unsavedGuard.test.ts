import { describe, it, expect, vi } from 'vitest'
import { guardBeforeUnload, type BeforeUnloadLike } from './unsavedGuard'

function fakeEvent() {
  const preventDefault = vi.fn()
  const e: BeforeUnloadLike = { preventDefault, returnValue: 'untouched' as string | boolean }
  return Object.assign(e, { preventDefault })
}

describe('guardBeforeUnload – V14 native beforeunload-skydd', () => {
  it('utan osparade ändringar: ingen prompt (rör inte eventet)', () => {
    const e = fakeEvent()
    const activated = guardBeforeUnload(e, false)
    expect(activated).toBe(false)
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(e.returnValue).toBe('untouched') // orört ⇒ ingen bekräftelse
  })

  it('med osparade ändringar: aktiverar prompten (preventDefault + returnValue)', () => {
    const e = fakeEvent()
    const activated = guardBeforeUnload(e, true)
    expect(activated).toBe(true)
    expect(e.preventDefault).toHaveBeenCalledTimes(1)
    expect(e.returnValue).toBe('') // legacy-signalen satt
  })

  it('övergång dirty → ren → dirty ger prompt endast när dirty', () => {
    expect(guardBeforeUnload(fakeEvent(), true)).toBe(true)   // efter en ändring
    expect(guardBeforeUnload(fakeEvent(), false)).toBe(false) // efter Spara/Avsluta-reset
    expect(guardBeforeUnload(fakeEvent(), true)).toBe(true)   // efter ny ändring
  })
})
