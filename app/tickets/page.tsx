"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Tickets } from "@/components/tickets"
import { TicketsOverview } from "@/components/tickets-overview"
import { Sidebar, MobileMenuButton } from "@/components/sidebar"
import { Toaster } from "@/components/ui/toaster"
import type { Location } from "@/lib/storage"

function TicketsContent() {
  const searchParams = useSearchParams()
  const locationParam = searchParams.get("location") as Location | null
  const showOverview = !locationParam

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background p-6">
        <div className="md:hidden fixed top-4 left-4 z-10">
          <MobileMenuButton />
        </div>
        {showOverview ? (
          <TicketsOverview />
        ) : (
          <Tickets initialLocation={locationParam || "Nyamira"} showBackToOverview />
        )}
      </main>
      <Toaster />
    </div>
  )
}

export default function TicketsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto bg-background p-6">
            <div className="md:hidden fixed top-4 left-4 z-10">
              <MobileMenuButton />
            </div>
            <div className="flex items-center justify-center h-full">
              <div className="text-muted-foreground">Loading tickets...</div>
            </div>
          </main>
          <Toaster />
        </div>
      }
    >
      <TicketsContent />
    </Suspense>
  )
}

