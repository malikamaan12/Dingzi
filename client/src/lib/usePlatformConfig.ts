import { useQuery } from '@tanstack/react-query';
import {
  DEFAULT_PLATFORM_CONFIG,
  resolvePlatformConfig,
  type PlatformConfig,
  type ResolvedPlatformConfig,
} from '@shared/venueConfig';

export function usePlatformConfig(): ResolvedPlatformConfig {
  const { data } = useQuery<{ config: Partial<PlatformConfig> }>({
    queryKey: ['/api/public/platform-config'],
    queryFn: async () => {
      const res = await fetch('/api/public/platform-config');
      if (!res.ok) return { config: DEFAULT_PLATFORM_CONFIG };
      return res.json();
    },
    staleTime: 30_000,
  });
  return resolvePlatformConfig(data?.config);
}
