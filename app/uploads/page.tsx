"use client"

import { Sidebar, MobileMenuButton } from "@/components/sidebar"
import { Toaster } from "@/components/ui/toaster"
import { UploadsPage } from "@/components/uploads-page"
import { useAuth } from "@/components/auth-provider"
import { Shield } from "lucide-react"

export default function Uploads() {
  const { role, loading } = useAuth()

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background p-6">
        <div className="md:hidden fixed top-4 left-4 z-10">
          <MobileMenuButton />
        </div>
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
      </main>
      <Toaster />
    </div>
  )
}
