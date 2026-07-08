"use client"

import { AssetTypeAdmin } from "@/components/asset-type-admin"
import { DashboardShell } from "@/components/dashboard-shell"
import { useAuth } from "@/components/auth-provider"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export default function AssetTypesPage() {
  const { role } = useAuth()

  if (role !== "superadmin") {
    return (
      <DashboardShell>
        <p className="text-muted-foreground">Superadmin access required to manage custom asset types.</p>
        <Button className="mt-4" asChild>
          <Link href="/asset-manager">Back to Asset Manager</Link>
        </Button>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <div className="w-full space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/asset-manager">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Asset Manager
          </Link>
        </Button>
        <AssetTypeAdmin />
      </div>
    </DashboardShell>
  )
}
