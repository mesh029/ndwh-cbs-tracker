"use client"

import { DashboardShell } from "@/components/dashboard-shell"
import { UploadsPage } from "@/components/uploads-page"
import { useAuth } from "@/components/auth-provider"
import { Shield } from "lucide-react"

export default function Uploads() {
  const { role, loading } = useAuth()

  return (
    <DashboardShell>
      {loading ? null : role === "superadmin" ? (
        <UploadsPage />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
          <div className="rounded-full bg-red-100 dark:bg-red-950 p-6">
            <Shield className="h-12 w-12 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold">Access Restricted</h2>
          <p className="text-muted-foreground max-w-sm">
            The Uploads page is only available to <strong>Super Admins</strong>.
            Please contact your system administrator if you need access.
          </p>
        </div>
      )}
    </DashboardShell>
  )
}
