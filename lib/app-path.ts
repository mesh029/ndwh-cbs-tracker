/** Normalize an in-app href for comparison (pathname only, no trailing slash except root). */
export function normalizeAppPath(path: string): string {
  const raw = path.trim().split("?")[0].split("#")[0]
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`
  return withSlash.replace(/\/+$/, "") || "/"
}
