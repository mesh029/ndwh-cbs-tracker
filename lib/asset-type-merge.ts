export type AssetTypeCountRow = {
  key: string
  type: string
  total: number
  active: number
  lost: number
  recovered: number
}

export function mergeAssetTypeCounts(
  catalog: Array<{ key: string; type: string }>,
  counts: AssetTypeCountRow[]
): AssetTypeCountRow[] {
  const countByKey = new Map(counts.map((row) => [row.key, row]))
  return catalog.map((entry) => {
    const row = countByKey.get(entry.key)
    return {
      key: entry.key,
      type: entry.type,
      total: row?.total ?? 0,
      active: row?.active ?? 0,
      lost: row?.lost ?? 0,
      recovered: row?.recovered ?? 0,
    }
  })
}
