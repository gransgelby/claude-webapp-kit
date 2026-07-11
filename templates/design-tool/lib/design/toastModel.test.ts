import { describe, it, expect } from 'vitest'
import { pushToast, dismissToast, type ToastItem } from './toastModel'

const t = (id: number, msg = `m${id}`, undo?: () => void): ToastItem => ({ id, msg, undo, tone: 'ok' })

describe('pushToast (W11: en notis åt gången, ingen stapling)', () => {
  it('ersätter föregående toast i st f att stapla (default max=1)', () => {
    let list: ToastItem[] = []
    list = pushToast(list, t(1))
    expect(list).toHaveLength(1)
    list = pushToast(list, t(2))
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(2)
  })

  it('behåller bara den SENASTE även vid snabb följd av push', () => {
    let list: ToastItem[] = []
    for (let i = 1; i <= 8; i++) list = pushToast(list, t(i))
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(8)
  })

  it('bevarar undo-callbacken på den enda synliga toasten', () => {
    let called = 0
    const undo = () => { called++ }
    let list: ToastItem[] = []
    list = pushToast(list, t(1))
    list = pushToast(list, t(2, 'ändrat', undo))
    expect(list).toHaveLength(1)
    expect(list[0].undo).toBe(undo)
    list[0].undo?.()
    expect(called).toBe(1)
  })

  it('respekterar en högre max om man vill tillåta en liten stapel', () => {
    let list: ToastItem[] = []
    for (let i = 1; i <= 5; i++) list = pushToast(list, t(i), 3)
    expect(list.map((x) => x.id)).toEqual([3, 4, 5])
  })

  it('muterar aldrig inlistan', () => {
    const before: ToastItem[] = [t(1)]
    const after = pushToast(before, t(2))
    expect(before).toHaveLength(1)
    expect(after).not.toBe(before)
  })
})

describe('dismissToast', () => {
  it('tar bort rätt toast via id', () => {
    const list = [t(1), t(2)]
    expect(dismissToast(list, 1)).toEqual([t(2)])
  })
  it('lämnar listan orörd om id saknas', () => {
    const list = [t(1)]
    expect(dismissToast(list, 99)).toEqual(list)
  })
})
