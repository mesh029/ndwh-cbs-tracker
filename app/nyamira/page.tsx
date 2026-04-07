"use client"

import { Suspense } from "react"
import { NyamiraDashboard } from "@/components/nyamira-dashboard"
import { OverviewDashboard } from "@/components/overview-dashboard"
import { Sidebar, MobileMenuButton } from "@/components/sidebar"
import { Toaster } from "@/components/ui/toaster"
import { useSearchParams } from "next/navigation"
import type { Location } from "@/lib/storage"
import { useAuth } from "@/components/auth-provider"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

const ALL_LOCATIONS: Location[] = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]

function CountyDashboardContent() {
  const { access } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const locationParam = searchParams.get("location") as Location | null
  const allowedLocations = (access?.locations === "all" || !access?.locations)
    ? ALL_LOCATIONS
    : ALL_LOCATIONS.filter((loc) => access.locations.includes(loc))
  const effectiveLocation = locationParam && allowedLocations.includes(locationParam) ? locationParam : null
  const showOverview = !effectiveLocation
  
  useEffect(() => {
    if (!locationParam && access?.locations !== "all" && allowedLocations.length > 0) {
      router.replace(`/nyamira?location=${encodeURIComponent(allowedLocations[0])}`)
      return
    }
    if (locationParam && !allowedLocations.includes(locationParam) && allowedLocations.length > 0) {
      router.replace(`/nyamira?location=${encodeURIComponent(allowedLocations[0])}`)
    }
  }, [locationParam, access?.locations, allowedLocations, router])
  
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background p-6">
        <div className="md:hidden fixed top-4 left-4 z-10">
          <MobileMenuButton />
        </div>
        {showOverview ? (
          <OverviewDashboard />
        ) : (
          <NyamiraDashboard location={effectiveLocation} />
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
          <div className="md:hidden fixed top-4 left-4 z-10">
            <MobileMenuButton />
          </div>
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
