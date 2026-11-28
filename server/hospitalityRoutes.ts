import type { Express } from 'express';
import { mountPublicGuestOrdersRoutes } from './hospitality/publicGuestOrdersRoutes';
import { mountPublicPagerAndTableRoutes } from './hospitality/publicPagerAndTableRoutes';
import { mountStaffPagerAndFloorRoutes } from './hospitality/staffPagerAndFloorRoutes';
import { mountSmartTagsAndAnalyticsRoutes } from './hospitality/smartTagsAndAnalyticsRoutes';
import { mountOrdersTeamAndTenantRoutes } from './hospitality/ordersTeamAndTenantRoutes';
import { mountTeamAndRbacRoutes } from './hospitality/teamAndRbacRoutes';
import { mountTenantBranchesAndPortfolioRoutes } from './hospitality/tenantBranchesAndPortfolioRoutes';
import { mountPlatformSettingsRoutes } from './hospitality/platformSettingsRoutes';
import { mountSuperAdminLifecycleRoutes } from './hospitality/superAdminLifecycleRoutes';

export function mountHospitalityRoutes(app: Express) {
  mountPlatformSettingsRoutes(app);
  mountSuperAdminLifecycleRoutes(app);
  mountPublicGuestOrdersRoutes(app);
  mountPublicPagerAndTableRoutes(app);
  mountStaffPagerAndFloorRoutes(app);
  mountSmartTagsAndAnalyticsRoutes(app);
  mountOrdersTeamAndTenantRoutes(app);
  mountTeamAndRbacRoutes(app);
  mountTenantBranchesAndPortfolioRoutes(app);
}
