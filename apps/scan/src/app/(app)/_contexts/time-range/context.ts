'use client';

import { createContext } from 'react';

import { DEFAULT_TIMEFRAME } from '@/types/timeframes';

import type { ActivityTimeframe } from '@/types/timeframes';

interface TimeRangeContextType {
  timeframe: ActivityTimeframe;
  selectTimeframe: (timeframe: ActivityTimeframe) => void;
}

export const TimeRangeContext = createContext<TimeRangeContextType>({
  timeframe: DEFAULT_TIMEFRAME,
  selectTimeframe: () => {
    void 0;
  },
});
