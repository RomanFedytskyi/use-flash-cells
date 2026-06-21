/**
 * Direction of a cell's value change.
 * 'up'   — value increased
 * 'down' — value decreased
 * null   — no change, or not yet observed
 */
export type FlashDirection = 'up' | 'down' | null

export interface UseFlashCellsOptions<T> {
  /** Field name that uniquely identifies each row (e.g. 'id', 'symbol'). */
  keyField: keyof T
  /** Numeric fields to watch for up/down changes. */
  fields: ReadonlyArray<keyof T>
  /**
   * How long (ms) flash state stays visible before auto-clearing.
   * Resets on every new update to the same cell.
   * @default 600
   */
  duration?: number
}
