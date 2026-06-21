import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useFlashCells } from '../src/useFlashCells'

interface Row {
  id: string
  price: number
  volume: number
}

const OPTIONS = { keyField: 'id' as const, fields: ['price', 'volume'] as const }

describe('useFlashCells', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  // ── Initial state ──────────────────────────────────────────────────────────

  it('returns null for all cells on first render (no previous to compare)', () => {
    const data: Row[] = [{ id: 'AAPL', price: 150, volume: 1000 }]
    const { result } = renderHook(() => useFlashCells(data, OPTIONS))

    expect(result.current.getFlash('AAPL', 'price')).toBeNull()
    expect(result.current.getFlash('AAPL', 'volume')).toBeNull()
  })

  it('returns null for an unknown row id', () => {
    const data: Row[] = [{ id: 'AAPL', price: 150, volume: 1000 }]
    const { result } = renderHook(() => useFlashCells(data, OPTIONS))

    expect(result.current.getFlash('UNKNOWN', 'price')).toBeNull()
  })

  it('returns null for a field not listed in options.fields', () => {
    const data: Row[] = [{ id: 'AAPL', price: 150, volume: 1000 }]
    const { result } = renderHook(() =>
      useFlashCells(data, { keyField: 'id', fields: ['price'] }),
    )
    // volume is not in fields → never tracked → null
    expect(result.current.getFlash('AAPL', 'volume')).toBeNull()
  })

  // ── Direction detection ────────────────────────────────────────────────────

  it('returns "up" when a numeric field increases', () => {
    const initial: Row[] = [{ id: 'AAPL', price: 150, volume: 1000 }]
    const { result, rerender } = renderHook(
      ({ data }: { data: Row[] }) => useFlashCells(data, OPTIONS),
      { initialProps: { data: initial } },
    )

    act(() => {
      rerender({ data: [{ id: 'AAPL', price: 155, volume: 1000 }] })
    })

    expect(result.current.getFlash('AAPL', 'price')).toBe('up')
  })

  it('returns "down" when a numeric field decreases', () => {
    const initial: Row[] = [{ id: 'AAPL', price: 150, volume: 1000 }]
    const { result, rerender } = renderHook(
      ({ data }: { data: Row[] }) => useFlashCells(data, OPTIONS),
      { initialProps: { data: initial } },
    )

    act(() => {
      rerender({ data: [{ id: 'AAPL', price: 145, volume: 1000 }] })
    })

    expect(result.current.getFlash('AAPL', 'price')).toBe('down')
  })

  it('returns null when a value is unchanged', () => {
    const initial: Row[] = [{ id: 'AAPL', price: 150, volume: 1000 }]
    const { result, rerender } = renderHook(
      ({ data }: { data: Row[] }) => useFlashCells(data, OPTIONS),
      { initialProps: { data: initial } },
    )

    act(() => {
      rerender({ data: [{ id: 'AAPL', price: 150, volume: 1000 }] })
    })

    expect(result.current.getFlash('AAPL', 'price')).toBeNull()
  })

  // ── Multi-field / multi-row ────────────────────────────────────────────────

  it('tracks multiple fields on the same row independently', () => {
    const initial: Row[] = [{ id: 'AAPL', price: 150, volume: 1000 }]
    const { result, rerender } = renderHook(
      ({ data }: { data: Row[] }) => useFlashCells(data, OPTIONS),
      { initialProps: { data: initial } },
    )

    act(() => {
      rerender({ data: [{ id: 'AAPL', price: 155, volume: 900 }] })
    })

    expect(result.current.getFlash('AAPL', 'price')).toBe('up')
    expect(result.current.getFlash('AAPL', 'volume')).toBe('down')
  })

  it('tracks multiple rows independently', () => {
    const initial: Row[] = [
      { id: 'AAPL', price: 150, volume: 1000 },
      { id: 'GOOG', price: 2800, volume: 500 },
    ]
    const { result, rerender } = renderHook(
      ({ data }: { data: Row[] }) => useFlashCells(data, OPTIONS),
      { initialProps: { data: initial } },
    )

    act(() => {
      rerender({
        data: [
          { id: 'AAPL', price: 155, volume: 1000 },
          { id: 'GOOG', price: 2790, volume: 500 },
        ],
      })
    })

    expect(result.current.getFlash('AAPL', 'price')).toBe('up')
    expect(result.current.getFlash('GOOG', 'price')).toBe('down')
  })

  // ── New rows ───────────────────────────────────────────────────────────────

  it('does not flash newly added rows (no previous value to compare)', () => {
    const initial: Row[] = [{ id: 'AAPL', price: 150, volume: 1000 }]
    const { result, rerender } = renderHook(
      ({ data }: { data: Row[] }) => useFlashCells(data, OPTIONS),
      { initialProps: { data: initial } },
    )

    act(() => {
      rerender({
        data: [
          { id: 'AAPL', price: 150, volume: 1000 },
          { id: 'GOOG', price: 2800, volume: 500 }, // brand-new row
        ],
      })
    })

    expect(result.current.getFlash('GOOG', 'price')).toBeNull()
  })

  // ── Timer behaviour ────────────────────────────────────────────────────────

  it('clears flash state after the default 600 ms duration', () => {
    const initial: Row[] = [{ id: 'AAPL', price: 150, volume: 1000 }]
    const { result, rerender } = renderHook(
      ({ data }: { data: Row[] }) => useFlashCells(data, OPTIONS),
      { initialProps: { data: initial } },
    )

    act(() => {
      rerender({ data: [{ id: 'AAPL', price: 155, volume: 1000 }] })
    })

    expect(result.current.getFlash('AAPL', 'price')).toBe('up')

    act(() => { vi.advanceTimersByTime(600) })

    expect(result.current.getFlash('AAPL', 'price')).toBeNull()
  })

  it('respects a custom duration', () => {
    const initial: Row[] = [{ id: 'AAPL', price: 150, volume: 1000 }]
    const { result, rerender } = renderHook(
      ({ data }: { data: Row[] }) =>
        useFlashCells(data, { ...OPTIONS, duration: 1200 }),
      { initialProps: { data: initial } },
    )

    act(() => {
      rerender({ data: [{ id: 'AAPL', price: 155, volume: 1000 }] })
    })

    act(() => { vi.advanceTimersByTime(600) })
    expect(result.current.getFlash('AAPL', 'price')).toBe('up') // still flashing

    act(() => { vi.advanceTimersByTime(600) })
    expect(result.current.getFlash('AAPL', 'price')).toBeNull() // cleared at 1200ms
  })

  it('resets the clear-timer on rapid successive updates to the same cell', () => {
    // Regression: without timer cancellation, the first timer would clear
    // the flash before the full duration elapsed after the second update.
    const initial: Row[] = [{ id: 'AAPL', price: 150, volume: 1000 }]
    const { result, rerender } = renderHook(
      ({ data }: { data: Row[] }) =>
        useFlashCells(data, { ...OPTIONS, duration: 600 }),
      { initialProps: { data: initial } },
    )

    // First update at t=0
    act(() => {
      rerender({ data: [{ id: 'AAPL', price: 155, volume: 1000 }] })
    })

    // Advance 400ms (first timer would fire at 600ms)
    act(() => { vi.advanceTimersByTime(400) })

    // Second update at t=400 — timer should reset to t+600 = t=1000
    act(() => {
      rerender({ data: [{ id: 'AAPL', price: 160, volume: 1000 }] })
    })

    // At t=600 the original timer would have fired — but it was cancelled
    act(() => { vi.advanceTimersByTime(200) })
    expect(result.current.getFlash('AAPL', 'price')).toBe('up') // still flashing

    // At t=1000 the reset timer fires
    act(() => { vi.advanceTimersByTime(400) })
    expect(result.current.getFlash('AAPL', 'price')).toBeNull()
  })

  it('clears each cell independently when they have different update times', () => {
    const initial: Row[] = [
      { id: 'AAPL', price: 150, volume: 1000 },
      { id: 'GOOG', price: 2800, volume: 500 },
    ]
    const { result, rerender } = renderHook(
      ({ data }: { data: Row[] }) =>
        useFlashCells(data, { ...OPTIONS, duration: 600 }),
      { initialProps: { data: initial } },
    )

    act(() => {
      rerender({
        data: [
          { id: 'AAPL', price: 155, volume: 1000 },
          { id: 'GOOG', price: 2790, volume: 500 },
        ],
      })
    })

    act(() => { vi.advanceTimersByTime(600) })

    expect(result.current.getFlash('AAPL', 'price')).toBeNull()
    expect(result.current.getFlash('GOOG', 'price')).toBeNull()
  })
})
