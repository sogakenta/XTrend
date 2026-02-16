/**
 * Valid offset values for time-based trend queries.
 * Used for validation and UI rendering.
 */
export const VALID_OFFSETS = [0, 1, 3, 6, 12, 24, 48, 72] as const;

export type ValidOffset = (typeof VALID_OFFSETS)[number];

/**
 * Offset labels for UI display
 */
export const OFFSET_LABELS: Record<ValidOffset, string> = {
  0: '現在',
  1: '1時間前',
  3: '3時間前',
  6: '6時間前',
  12: '12時間前',
  24: '24時間前',
  48: '2日前',
  72: '3日前',
};
