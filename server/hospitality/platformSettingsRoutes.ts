import type { Express } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { isSuperAdmin } from '../localAuth';
import { platformSettings } from '@shared/schema';
import {
  DEFAULT_PLATFORM_CONFIG,
  platformConfigSchema,
  resolvePlatformConfig,
  type PlatformConfig,
  type ResolvedPlatformConfig,
} from '@shared/venueConfig';

export const PUBLIC_PLATFORM_CONFIG_KEY = 'public_platform_config';

export async function loadPlatformConfig(executor: Pick<typeof db, 'select'> = db): Promise<ResolvedPlatformConfig> {
  try {
    const [row] = await executor
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.key, PUBLIC_PLATFORM_CONFIG_KEY));
    return resolvePlatformConfig((row?.value as Partial<PlatformConfig> | undefined) || null);
  } catch {
    return { ...DEFAULT_PLATFORM_CONFIG };
  }
}

export function mountPlatformSettingsRoutes(app: Express) {
  app.get('/api/public/platform-config', async (_req, res, next) => {
    try {
      const config = await loadPlatformConfig();
      res.json({ config });
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/super-admin/platform-settings', isSuperAdmin, async (_req, res, next) => {
    try {
      const config = await loadPlatformConfig();
      res.json({ config });
    } catch (e) {
      next(e);
    }
  });

  app.put('/api/super-admin/platform-settings', isSuperAdmin, async (req, res, next) => {
    try {
      const parsed = platformConfigSchema.parse(req.body);
      const saved = await db.transaction(async tx => {
        const [existing] = await tx
          .select()
          .from(platformSettings)
          .where(eq(platformSettings.key, PUBLIC_PLATFORM_CONFIG_KEY));
        const merged: Partial<PlatformConfig> = {
          ...((existing?.value as Partial<PlatformConfig> | undefined) || {}),
          ...parsed,
        };
        const [upserted] = await tx
          .insert(platformSettings)
          .values({
            key: PUBLIC_PLATFORM_CONFIG_KEY,
            value: merged,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: platformSettings.key,
            set: { value: merged, updatedAt: new Date() },
          })
          .returning();
        return upserted;
      });
      res.json({ config: resolvePlatformConfig(saved.value as Partial<PlatformConfig>) });
    } catch (e) {
      next(e);
    }
  });
}
