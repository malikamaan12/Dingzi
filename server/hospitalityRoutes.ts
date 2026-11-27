import type { Express } from 'express';
import { mountPublicGuestOrdersRoutes } from './hospitality/publicGuestOrdersRoutes';
import { mountPublicPagerAndTableRoutes } from './hospitality/publicPagerAndTableRoutes';
import { mountStaffPagerAndFloorRoutes } from './hospitality/staffPagerAndFloorRoutes';
import { mountSmartTagsAndAnalyticsRoutes } from './hospitality/smartTagsAndAnalyticsRoutes';
import { mountOrdersTeamAndTenantRoutes } from './hospitality/ordersTeamAndTenantRoutes';

export function mountHospitalityRoutes(app: Express) {
  mountPublicGuestOrdersRoutes(app);
  mountPublicPagerAndTableRoutes(app);
  mountStaffPagerAndFloorRoutes(app);
  mountSmartTagsAndAnalyticsRoutes(app);
  mountOrdersTeamAndTenantRoutes(app);
}
