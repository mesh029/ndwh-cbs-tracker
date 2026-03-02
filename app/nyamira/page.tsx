"use client"

import { NyamiraDashboard } from "@/components/nyamira-dashboard"
import { Sidebar } from "@/components/sidebar"
import { Toaster } from "@/components/ui/toaster"
import { useSearchParams } from "next/navigation"
import type { Location } from "@/lib/storage"

export default function CountyDashboardPage() {
  const searchParams = useSearchParams()
  const locationParam = searchParams.get("location") as Location | null
  
  // Use location from URL param if provided, otherwise default to "Nyamira"
  const defaultLocation: Location = locationParam || "Nyamira"
  
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background p-6">
        <NyamiraDashboard location={defaultLocation} />
      </main>
      <Toaster />
    </div>
  )
}
