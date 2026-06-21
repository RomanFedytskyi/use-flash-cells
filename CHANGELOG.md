# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-06-22

### Added
- **Core hook** (`useFlashCells`): tracks per-cell numeric value changes across a
  dataset and exposes `'up' | 'down' | null` flash direction per `{rowId, field}`.
  Diffs every data update against a stable `useRef` snapshot — `setFlashMap` is
  called only when at least one value actually changed, so unchanged data objects
  cause zero re-renders.
- **Auto-clear timer** per cell: flash state clears after a configurable `duration`
  (default 600 ms). Resets on rapid successive updates to the same cell so the
  flash never cuts short mid-update.
- **New-row safety**: rows with no prior snapshot are never flashed on first
  appearance.
- **`FlashDirection` type** re-exported for TypeScript consumers.
- **Zero runtime dependencies**; single peer dependency (`react >= 16.8`).
- **Dual ESM + CJS build** via tsup; full `.d.ts` declarations included.
- **30 tests** via Vitest: 13 unit tests covering initial state, up/down/null
  direction, multi-field, multi-row, new-row no-flash, default/custom duration,
  timer reset on rapid updates, and independent per-cell clearing; plus 17
  stress/edge-case tests covering NaN-safe field values, unmount timer cleanup,
  `duration: 0`, empty-data transitions, row removal mid-flash, numeric row IDs,
  50-update bursts, direction flips, 100-row × 2-field dataset, untracked fields,
  and duration changes between renders.
- **Interactive demo** (`demo/index.html`): zero-dependency HTML page simulating a
  live price feed across 6 tickers. Open in any browser — no build step. Includes
  a duration slider and a real-time change log.
- CI matrix: Node 18 / 20 / 22 on every push and pull request.

### Fixed
- **NaN comparison bug** (critical): fields with `undefined` or non-numeric values
  produce `Number(value) = NaN`. Because `NaN !== NaN` is `true` in JavaScript,
  the comparison triggered a spurious flash on every render for any such cell.
  Added `!Number.isNaN()` guards to both sides of the diff check.
- **`getFlash` stability**: wrapped in `useCallback([flashMap])` so the function
  reference is stable between renders where flash state has not changed, preventing
  unnecessary child re-renders.
- **TypeScript**: `beforeEach(() => vi.useFakeTimers())` implicitly returned
  `VitestUtils` into a `void`-typed callback. Changed to block-body form across
  all test files.
