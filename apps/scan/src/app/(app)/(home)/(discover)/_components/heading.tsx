import { HeadingContainer } from '../../../../_components/layout/page-utils';

import { Logo } from '@/components/logo';

import { DiscoverSearchInput, DiscoverSearchSubmit } from './discover-search';

export const DiscoverHeading = () => {
  return (
    <HeadingContainer className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Logo className="size-8" />
          <h1 className="text-2xl md:text-4xl font-bold font-mono">
            FrostyScan
          </h1>
        </div>
        <p className="text-muted-foreground text-sm">
          The x402 explorer, analytics dashboard and marketplace for the
          FrostyFi ecosystem — paid APIs and agents on Base and HyperEVM
        </p>
      </div>
      <div className="flex flex-col md:flex-row items-center gap-2">
        <DiscoverSearchInput />
        <DiscoverSearchSubmit />
      </div>
    </HeadingContainer>
  );
};
