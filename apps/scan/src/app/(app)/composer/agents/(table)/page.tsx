import { Body, Heading } from '@/app/_components/layout/page-utils';
import { defaultAgentsSorting } from '@/app/(app)/_contexts/sorting/agents/default';
import { AgentsSortingProvider } from '@/app/(app)/_contexts/sorting/agents/provider';
import { AgentsTable } from '@/app/(app)/_components/agents/table';
import { DEFAULT_TIMEFRAME } from '@/types/timeframes';
import { TimeRangeProvider } from '@/app/(app)/_contexts/time-range/provider';
import { RangeSelector } from '@/app/(app)/_contexts/time-range/component';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agents',
  description: 'Discover the most popular agents on FrostyScan',
};

export default function AgentsPage() {
  return (
    <AgentsSortingProvider initialSorting={defaultAgentsSorting}>
      <TimeRangeProvider initialTimeframe={DEFAULT_TIMEFRAME}>
        <Heading
          title="Agents"
          description="Discover the most popular agents on FrostyScan"
          actions={<RangeSelector />}
        />
        <Body>
          <AgentsTable
            input={{
              timeframe: DEFAULT_TIMEFRAME,
            }}
            limit={10}
          />
        </Body>
      </TimeRangeProvider>
    </AgentsSortingProvider>
  );
}
