export enum ActivityTimeframe {
  AllTime = 0,
  OneDay = 1,
  SevenDays = 7,
  FifteenDays = 14,
  ThirtyDays = 30,
}

/** Use sparingly - only for explicit "all time" queries where supported */
export const ALL_TIME_TIMEFRAME = ActivityTimeframe.AllTime;

/**
 * Fork-only: default timeframe for every page/prefetch. All Time until the
 * instance sees steady daily traffic worth defaulting to a 24h window.
 */
export const DEFAULT_TIMEFRAME = ActivityTimeframe.AllTime;
