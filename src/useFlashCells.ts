import { useCallback, useEffect, useRef, useState } from 'react'
import type { FlashDirection, UseFlashCellsOptions } from './types'

type FlashMap = Map<string, FlashDirection>

/**
 * Tracks numeric field changes across a dataset and exposes per-cell flash
 * direction ('up' | 'down' | null). Headless — returns state only, no DOM
 * output. Composes with MUI DataGrid, TanStack Table, or any other renderer.
 *
 * @example
 * ```tsx
 * const { getFlash } = useFlashCells(rows, {
 *   keyField: 'id',
 *   fields: ['price', 'bid', 'ask'],
 *   duration: 600,
 * })
 *
 * // Inside a cell renderer:
 * const dir = getFlash(row.id, 'price') // 'up' | 'down' | null
 * ```
 */
export function useFlashCells<T>(
  data: T[],
  options: UseFlashCellsOptions<T>,
): { getFlash: (rowId: string | number, field: keyof T) => FlashDirection } {
  // Stable refs for options — keeps data as the only effect dependency,
  // avoids stale closures without needing options in the dep array.
  const keyFieldRef = useRef(options.keyField)
  const fieldsRef = useRef(options.fields)
  const durationRef = useRef(options.duration ?? 600)
  keyFieldRef.current = options.keyField
  fieldsRef.current = options.fields
  durationRef.current = options.duration ?? 600

  // Previous snapshot: rowId → (fieldName → numericValue)
  const prevRef = useRef<Map<string, Map<string, number>>>(new Map())

  // Active flash states: "rowId:field" → 'up' | 'down'
  const [flashMap, setFlashMap] = useState<FlashMap>(new Map())

  // Pending clear-timeout handles, keyed by "rowId:field"
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const keyField = keyFieldRef.current
    const fields = fieldsRef.current
    const duration = durationRef.current
    const prev = prevRef.current

    // 1. Diff current data against previous snapshot
    const updates: Array<[key: string, dir: FlashDirection]> = []

    for (const row of data) {
      const rowId = String((row as Record<string, unknown>)[String(keyField)])
      const prevRow = prev.get(rowId)

      // Only diff rows we've seen before — new rows don't flash
      if (prevRow !== undefined) {
        for (const field of fields) {
          const currVal = Number((row as Record<string, unknown>)[String(field)])
          const prevVal = prevRow.get(String(field))

          // Guard against NaN: Number(undefined) = NaN, and NaN !== NaN is true,
          // which would cause perpetual flashing for missing/non-numeric field values.
          if (
            prevVal !== undefined &&
            !Number.isNaN(prevVal) &&
            !Number.isNaN(currVal) &&
            prevVal !== currVal
          ) {
            updates.push([
              `${rowId}:${String(field)}`,
              currVal > prevVal ? 'up' : 'down',
            ])
          }
        }
      }
    }

    // 2. Apply updates and schedule clears
    if (updates.length > 0) {
      setFlashMap(current => {
        const next = new Map(current)

        for (const [key, dir] of updates) {
          next.set(key, dir)

          // Cancel any existing clear-timer for this cell so rapid updates
          // don't clear the flash prematurely.
          const existing = timeoutsRef.current.get(key)
          if (existing !== undefined) clearTimeout(existing)

          const t = setTimeout(() => {
            setFlashMap(m => {
              const n = new Map(m)
              n.delete(key)
              return n
            })
            timeoutsRef.current.delete(key)
          }, duration)

          timeoutsRef.current.set(key, t)
        }

        return next
      })
    }

    // 3. Update snapshot for next render
    const snapshot = new Map<string, Map<string, number>>()
    for (const row of data) {
      const r = row as Record<string, unknown>
      const rowId = String(r[String(keyField)])
      const fieldMap = new Map<string, number>()
      for (const field of fields) {
        fieldMap.set(String(field), Number(r[String(field)]))
      }
      snapshot.set(rowId, fieldMap)
    }
    prevRef.current = snapshot
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup all pending timers on unmount
  useEffect(() => {
    const timeouts = timeoutsRef.current
    return () => {
      for (const t of timeouts.values()) clearTimeout(t)
    }
  }, [])

  // Memoize so the function reference is stable between renders where flashMap
  // hasn't changed — prevents unnecessary child re-renders when passed as a prop.
  const getFlash = useCallback(
    (rowId: string | number, field: keyof T): FlashDirection =>
      flashMap.get(`${String(rowId)}:${String(field)}`) ?? null,
    [flashMap],
  )

  return { getFlash }
}
