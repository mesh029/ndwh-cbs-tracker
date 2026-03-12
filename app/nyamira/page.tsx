"use client"

import { Suspense } from "react"
import { NyamiraDashboard } from "@/components/nyamira-dashboard"
import { OverviewDashboard } from "@/components/overview-dashboard"
import { Sidebar } from "@/components/sidebar"
import { Toaster } from "@/components/ui/toaster"
import { useSearchParams } from "next/navigation"
import type { Location } from "@/lib/storage"

function CountyDashboardContent() {
  const searchParams = useSearchParams()
  const locationParam = searchParams.get("location") as Location | null
  
  // Show overview if no location param, otherwise show specific county
  const showOverview = !locationParam
  
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background p-6">
        {showOverview ? (
          <OverviewDashboard />
        ) : (
          <NyamiraDashboard location={locationParam} />
        )}
      </main>
      <Toaster />
    </div>
  )
}

export default function CountyDashboardPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-background p-6">
          <div className="flex items-center justify-center h-full">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        </main>
        <Toaster />
      </div>
    }>
      <CountyDashboardContent />
    </Suspense>
  )
}
