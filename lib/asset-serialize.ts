import { lifecycleFromRecord } from "@/lib/asset-lifecycle"

/** Attach lifecycle fields to API JSON for any Prisma asset row. */
export function withLifecycle<T extends Record<string, unknown>>(row: T): T & ReturnType<typeof lifecycleFromRecord> {
  return { ...row, ...lifecycleFromRecord(row as Parameters<typeof lifecycleFromRecord>[0]) }
}
