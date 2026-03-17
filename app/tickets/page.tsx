"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Tickets } from "@/components/tickets"
import { TicketsOverview } from "@/components/tickets-overview"
import { GuestTicketsView } from "@/components/guest-tickets-view"
import { Sidebar, MobileMenuButton } from "@/components/sidebar"
import { Toaster } from "@/components/ui/toaster"
import { useAuth } from "@/components/auth-provider"
import type { Location } from "@/lib/storage"

function TicketsContent() {
  const { role, loading } = useAuth()
  const searchParams = useSearchParams()
  const locationParam = searchParams.get("location") as Location | null
  const showOverview = !locationParam

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    )
  }

  // ── Guest view ──────────────────────────────────────────────────────────────
  if (role === "guest") {
    return <GuestTicketsView />
  }

  // ── Admin / Superadmin view ─────────────────────────────────────────────────
  if (showOverview) {
    return <TicketsOverview />
  }
  return <Tickets initialLocation={locationParam || "Nyamira"} showBackToOverview />
}

export default function TicketsPage() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background p-4 sm:p-6">
        <div className="md:hidden fixed top-4 left-4 z-10">
          <MobileMenuButton />
        </div>
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full">
              <div className="text-muted-foreground text-sm">Loading tickets…</div>
            </div>
          }
        >
          <TicketsContent />
        </Suspense>
      </main>
      <Toaster />
    </div>
  )
}
