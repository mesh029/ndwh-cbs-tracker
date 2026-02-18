"use client"

import { Tickets } from "@/components/tickets"
import { Sidebar } from "@/components/sidebar"
import { Toaster } from "@/components/ui/toaster"

export default function TicketsPage() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background p-6">
        <Tickets />
      </main>
      <Toaster />
    </div>
  )
}
