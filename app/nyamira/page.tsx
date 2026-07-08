"use client"

import { Suspense } from "react"
import { NyamiraDashboard } from "@/components/nyamira-dashboard"
import { OverviewDashboard } from "@/components/overview-dashboard"
import { DashboardShell } from "@/components/dashboard-shell"
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

  return showOverview ? <OverviewDashboard /> : <NyamiraDashboard location={effectiveLocation} />
}

export default function CountyDashboardPage() {
  return (
    <DashboardShell>
      <Suspense fallback={<OverviewDashboard />}>
        <CountyDashboardContent />
      </Suspense>
    </DashboardShell>
  )
}
