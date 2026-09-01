'use client';

import { api } from '@/trpc/client';
import { AgentCard } from '../lib/agent-card';
import { DEFAULT_TIMEFRAME } from '@/types/timeframes';

export const AgentsContent: React.FC = () => {
  const [topAgents] = api.public.agents.list.useSuspenseQuery({
    timeframe: DEFAULT_TIMEFRAME,
    pagination: {
      page: 0,
      page_size: 10,
    },
  });

  return (
    <>
      {topAgents.items.slice(0, 4).map(agent => (
        <AgentCard key={agent.id} agentConfiguration={agent} />
      ))}
    </>
  );
};
