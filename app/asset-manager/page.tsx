import dynamic from "next/dynamic"
import { DashboardShell } from "@/components/dashboard-shell"

const AssetManager = dynamic(
  () => import("@/components/asset-manager").then((mod) => ({ default: mod.AssetManager })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        Loading asset center…
      </div>
    ),
  }
)

export default function AssetManagerPage() {
  return (
    <DashboardShell>
      <AssetManager />
    </DashboardShell>
  )
}
