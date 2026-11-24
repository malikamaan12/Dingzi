import { sql } from 'drizzle-orm';
import { db } from './db';

export interface RlsSessionContext {
  userId?: string | null;
  role?: string | null;
  tenantId?: string | null;
  branchId?: string | null;
}

/**
 * Sets transaction-local PostgreSQL session context (`SET LOCAL app.current_*`)
 * per PRD §6.1 so Row-Level Security policies enforce tenant/branch isolation
 * inside database transactions on both PostgreSQL 16 and PGlite.
 */
export async function applyRlsSessionContext(tx: any, ctx: RlsSessionContext): Promise<void> {
  await tx.execute(
    sql`SELECT
      set_config('app.current_user_id', ${ctx.userId || ''}, true),
      set_config('app.current_role', ${ctx.role || ''}, true),
      set_config('app.current_tenant_id', ${ctx.tenantId || ''}, true),
      set_config('app.current_branch_id', ${ctx.branchId || ''}, true)`,
  );
}

export async function withTenantRlsTransaction<T>(
  ctx: RlsSessionContext,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return await db.transaction(async tx => {
    await applyRlsSessionContext(tx, ctx);
    return await fn(tx);
  });
}
