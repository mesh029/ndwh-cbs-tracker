"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Tickets } from "@/components/tickets"
import { TicketsOverview } from "@/components/tickets-overview"
import { GuestTicketsView } from "@/components/guest-tickets-view"
import { DashboardShell } from "@/components/dashboard-shell"
import { useAuth } from "@/components/auth-provider"
import type { Location } from "@/lib/storage"

function TicketsContent() {
  const { role, access, loading } = useAuth()
  const searchParams = useSearchParams()
  const locationParam = searchParams.get("location") as Location | null
  const allowedLocations = (access?.locations === "all" || !access?.locations)
    ? (["Kakamega", "Vihiga", "Nyamira", "Kisumu"] as Location[])
    : (["Kakamega", "Vihiga", "Nyamira", "Kisumu"] as Location[]).filter((loc) => access.locations.includes(loc))
  const effectiveLocation = locationParam && allowedLocations.includes(locationParam) ? locationParam : (allowedLocations[0] || "Nyamira")
  const showOverview = !locationParam

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    )
  }

  if (role === "guest") {
    return <GuestTicketsView />
  }

  if (showOverview) {
    return <TicketsOverview />
  }
  return <Tickets initialLocation={effectiveLocation} showBackToOverview />
}

export default function TicketsPage() {
  return (
    <DashboardShell>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full">
            <div className="text-muted-foreground text-sm">Loading tickets…</div>
          </div>
        }
      >
        <TicketsContent />
      </Suspense>
    </DashboardShell>
  )
}
