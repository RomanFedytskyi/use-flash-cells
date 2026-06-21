/**
 * Stress / edge-case tests for useFlashCells.
 *
 * These go beyond the happy-path unit tests and probe:
 *   - NaN comparison safety (undefined / null field values)
 *   - Unmount timer cleanup
 *   - duration: 0
 *   - Empty dataset transitions
 *   - Row removal
 *   - Numeric row IDs
 *   - High-frequency bursts (50 rapid updates to one cell)
 *   - Flash-direction flip within a single burst
 *   - Large dataset (100 rows × 2 fields)
 *   - Unknown / untracked fields after a data change
 *   - Duration changes between renders
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useFlashCells } from '../src/useFlashCells'

// ── shared types ──────────────────────────────────────────────────────────

interface Row {
  id: string
  price: number
  volume: number
}

interface RowOpt {
  id: string
  price?: number  // intentionally optional to test missing-value handling
  volume?: number
}

const OPT = { keyField: 'id' as const, fields: ['price', 'volume'] as const }

// ── NaN / undefined / null values ────────────────────────────────────────

describe('NaN / undefined / null field values', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('does NOT flash when a field is absent on both renders (NaN !== NaN guard)', () => {
    // Without the guard: Number(undefined) = NaN, NaN !== NaN = true → perpetual flash
    // With exactOptionalPropertyTypes we omit the field instead of passing undefined
    const initial: RowOpt[] = [{ id: 'A', volume: 1000 }]        // price absent
    const { result, rerender } = renderHook(
      ({ d }: { d: RowOpt[] }) =>
        useFlashCells(d, { keyField: 'id', fields: ['price', 'volume'] }),
      { initialProps: { d: initial } },
    )
    act(() => {
      rerender({ d: [{ id: 'A', volume: 1000 }] })                // price still absent
    })
    expect(result.current.getFlash('A', 'price')).toBeNull()
  })

  it('does NOT flash when a field transitions from absent to a real value', () => {
    const initial: RowOpt[] = [{ id: 'A', volume: 1000 }]        // price absent (NaN)
    const { result, rerender } = renderHook(
      ({ d }: { d: RowOpt[] }) =>
        useFlashCells(d, { keyField: 'id', fields: ['price', 'volume'] }),
      { initialProps: { d: initial } },
    )
    act(() => {
      rerender({ d: [{ id: 'A', price: 150, volume: 1000 }] })   // price appears
    })
    // previous value was NaN — no valid direction can be established
    expect(result.current.getFlash('A', 'price')).toBeNull()
  })

  it('does NOT flash when a field transitions from a value to absent', () => {
    const initial: RowOpt[] = [{ id: 'A', price: 150, volume: 1000 }]
    const { result, rerender } = renderHook(
      ({ d }: { d: RowOpt[] }) =>
        useFlashCells(d, { keyField: 'id', fields: ['price', 'volume'] }),
      { initialProps: { d: initial } },
    )
    act(() => {
      rerender({ d: [{ id: 'A', volume: 1000 }] })                // price disappears (NaN)
    })
    // current value is NaN — no valid direction
    expect(result.current.getFlash('A', 'price')).toBeNull()
  })

  it('treats null as 0 (Number(null) = 0) and flashes "up" when value rises', () => {
    // null is an explicit non-optional value; Number(null) = 0 is a finite number
    const initial: Row[] = [{ id: 'A', price: 0, volume: 0 }]
    const { result, rerender } = renderHook(
      ({ d }: { d: Row[] }) => useFlashCells(d, OPT),
      { initialProps: { d: initial } },
    )
    act(() => {
      rerender({ d: [{ id: 'A', price: 10, volume: 0 }] })
    })
    expect(result.current.getFlash('A', 'price')).toBe('up')
  })
})

// ── Unmount cleanup ───────────────────────────────────────────────────────

describe('unmount cleanup', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('cancels all pending timers on unmount (no setState after unmount)', () => {
    const initial: Row[] = [{ id: 'A', price: 100, volume: 1 }]
    const { result, rerender, unmount } = renderHook(
      ({ d }: { d: Row[] }) => useFlashCells(d, OPT),
      { initialProps: { d: initial } },
    )

    act(() => {
      rerender({ d: [{ id: 'A', price: 110, volume: 1 }] })
    })
    expect(result.current.getFlash('A', 'price')).toBe('up')

    // Unmount before the 600 ms timer fires
    unmount()

    // Advancing time after unmount must not throw or trigger state updates
    expect(() => {
      act(() => { vi.advanceTimersByTime(1000) })
    }).not.toThrow()
  })
})

// ── duration: 0 ──────────────────────────────────────────────────────────

describe('duration: 0', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('clears flash on the next tick when duration is 0', () => {
    const initial: Row[] = [{ id: 'A', price: 100, volume: 1 }]
    const { result, rerender } = renderHook(
      ({ d }: { d: Row[] }) => useFlashCells(d, { ...OPT, duration: 0 }),
      { initialProps: { d: initial } },
    )

    act(() => {
      rerender({ d: [{ id: 'A', price: 110, volume: 1 }] })
    })
    expect(result.current.getFlash('A', 'price')).toBe('up')

    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current.getFlash('A', 'price')).toBeNull()
  })
})

// ── Empty dataset transitions ─────────────────────────────────────────────

describe('empty dataset', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('returns null on first render with empty data', () => {
    const { result } = renderHook(() => useFlashCells([] as Row[], OPT))
    expect(result.current.getFlash('ANYTHING', 'price')).toBeNull()
  })

  it('does not flash when going from empty to populated (no previous snapshot)', () => {
    const { result, rerender } = renderHook(
      ({ d }: { d: Row[] }) => useFlashCells(d, OPT),
      { initialProps: { d: [] as Row[] } },
    )
    act(() => {
      rerender({ d: [{ id: 'A', price: 100, volume: 1 }] })
    })
    // Brand-new row — no previous snapshot → null
    expect(result.current.getFlash('A', 'price')).toBeNull()
  })

  it('does not flash when going from populated to empty', () => {
    const initial: Row[] = [{ id: 'A', price: 100, volume: 1 }]
    const { result, rerender } = renderHook(
      ({ d }: { d: Row[] }) => useFlashCells(d, OPT),
      { initialProps: { d: initial } },
    )
    act(() => {
      rerender({ d: [] })
    })
    // No data — no crash, nothing to diff
    expect(result.current.getFlash('A', 'price')).toBeNull()
  })
})

// ── Row removal ───────────────────────────────────────────────────────────

describe('row removal', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('does not crash when a row is removed while its flash timer is pending', () => {
    const initial: Row[] = [
      { id: 'A', price: 100, volume: 1 },
      { id: 'B', price: 200, volume: 2 },
    ]
    const { result, rerender } = renderHook(
      ({ d }: { d: Row[] }) => useFlashCells(d, OPT),
      { initialProps: { d: initial } },
    )

    act(() => {
      rerender({
        d: [
          { id: 'A', price: 100, volume: 1 },
          { id: 'B', price: 210, volume: 2 }, // B flashes up
        ],
      })
    })
    expect(result.current.getFlash('B', 'price')).toBe('up')

    // Remove B before timer fires
    act(() => {
      rerender({ d: [{ id: 'A', price: 100, volume: 1 }] })
    })

    // Timer fires for a row that no longer exists — must not throw
    expect(() => {
      act(() => { vi.advanceTimersByTime(600) })
    }).not.toThrow()

    expect(result.current.getFlash('B', 'price')).toBeNull()
  })

  it('continues tracking remaining rows after another row is removed', () => {
    const initial: Row[] = [
      { id: 'A', price: 100, volume: 1 },
      { id: 'B', price: 200, volume: 2 },
    ]
    const { result, rerender } = renderHook(
      ({ d }: { d: Row[] }) => useFlashCells(d, OPT),
      { initialProps: { d: initial } },
    )

    // Remove B and simultaneously change A's price
    act(() => {
      rerender({ d: [{ id: 'A', price: 105, volume: 1 }] })
    })

    expect(result.current.getFlash('A', 'price')).toBe('up')
  })
})

// ── Numeric row IDs ───────────────────────────────────────────────────────

describe('numeric row IDs', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('handles number-type IDs via String() coercion', () => {
    interface NumRow { id: number; price: number; volume: number }
    const initial: NumRow[] = [{ id: 1, price: 100, volume: 1 }]
    const { result, rerender } = renderHook(
      ({ d }: { d: NumRow[] }) =>
        useFlashCells(d, { keyField: 'id', fields: ['price', 'volume'] }),
      { initialProps: { d: initial } },
    )
    act(() => {
      rerender({ d: [{ id: 1, price: 110, volume: 1 }] })
    })
    // Both number and string form of the ID must resolve the same flash key
    expect(result.current.getFlash(1, 'price')).toBe('up')
    expect(result.current.getFlash('1', 'price')).toBe('up')
  })
})

// ── Unknown / untracked fields ────────────────────────────────────────────

describe('getFlash on untracked fields', () => {
  it('returns null for a field that changed but is not in options.fields', () => {
    const initial: Row[] = [{ id: 'A', price: 100, volume: 1 }]
    const { result, rerender } = renderHook(
      ({ d }: { d: Row[] }) =>
        useFlashCells(d, { keyField: 'id', fields: ['price'] }),
      { initialProps: { d: initial } },
    )
    act(() => {
      rerender({ d: [{ id: 'A', price: 100, volume: 999 }] }) // volume changes but untracked
    })
    expect(result.current.getFlash('A', 'volume')).toBeNull()
  })
})

// ── High-frequency burst ──────────────────────────────────────────────────

describe('high-frequency burst', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('survives 50 rapid upward updates and clears after a single timer fires', () => {
    const initial: Row[] = [{ id: 'A', price: 100, volume: 1 }]
    const { result, rerender } = renderHook(
      ({ d }: { d: Row[] }) => useFlashCells(d, { ...OPT, duration: 600 }),
      { initialProps: { d: initial } },
    )

    for (let i = 1; i <= 50; i++) {
      act(() => {
        rerender({ d: [{ id: 'A', price: 100 + i, volume: 1 }] })
      })
    }

    expect(result.current.getFlash('A', 'price')).toBe('up')

    // All 50 intermediate timers were cancelled; only the last one remains
    act(() => { vi.advanceTimersByTime(600) })
    expect(result.current.getFlash('A', 'price')).toBeNull()
  })

  it('reflects the latest direction when a cell flips from up to down in a burst', () => {
    const initial: Row[] = [{ id: 'A', price: 100, volume: 1 }]
    const { result, rerender } = renderHook(
      ({ d }: { d: Row[] }) => useFlashCells(d, OPT),
      { initialProps: { d: initial } },
    )

    act(() => {
      rerender({ d: [{ id: 'A', price: 110, volume: 1 }] })
    })
    expect(result.current.getFlash('A', 'price')).toBe('up')

    act(() => {
      rerender({ d: [{ id: 'A', price: 90, volume: 1 }] })
    })
    // Direction flipped — must return 'down', not stale 'up'
    expect(result.current.getFlash('A', 'price')).toBe('down')
  })
})

// ── Large dataset ─────────────────────────────────────────────────────────

describe('large dataset (100 rows)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('correctly tracks 100 rows × 2 fields with no cross-contamination', () => {
    const makeRows = (offset: number): Row[] =>
      Array.from<unknown, Row>({ length: 100 }, (_, i) => ({
        id: String(i),
        price: 100 + i + offset,
        volume: 1000 + i,
      }))

    const { result, rerender } = renderHook(
      ({ d }: { d: Row[] }) => useFlashCells(d, OPT),
      { initialProps: { d: makeRows(0) } },
    )

    // Every row's price increases by 1, volume stays the same
    act(() => {
      rerender({ d: makeRows(1) })
    })

    for (let i = 0; i < 100; i++) {
      expect(result.current.getFlash(String(i), 'price')).toBe('up')
      expect(result.current.getFlash(String(i), 'volume')).toBeNull()
    }

    act(() => { vi.advanceTimersByTime(600) })

    for (let i = 0; i < 100; i++) {
      expect(result.current.getFlash(String(i), 'price')).toBeNull()
    }
  })
})

// ── Duration changes between renders ─────────────────────────────────────

describe('duration option changes between renders', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('applies the updated duration to the next flash', () => {
    const initial: Row[] = [{ id: 'A', price: 100, volume: 1 }]
    let dur = 1200
    const { result, rerender } = renderHook(
      ({ d }: { d: Row[] }) => useFlashCells(d, { ...OPT, duration: dur }),
      { initialProps: { d: initial } },
    )

    act(() => {
      rerender({ d: [{ id: 'A', price: 110, volume: 1 }] })
    })

    act(() => { vi.advanceTimersByTime(600) })
    expect(result.current.getFlash('A', 'price')).toBe('up') // still on at 600 ms

    act(() => { vi.advanceTimersByTime(600) })
    expect(result.current.getFlash('A', 'price')).toBeNull() // clears at 1200 ms
  })
})
