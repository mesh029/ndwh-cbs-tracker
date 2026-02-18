"use client"

import { NyamiraDashboard } from "@/components/nyamira-dashboard"
import { Sidebar } from "@/components/sidebar"
import { Toaster } from "@/components/ui/toaster"

export default function NyamiraPage() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background p-6">
        <NyamiraDashboard />
      </main>
      <Toaster />
    </div>
  )
}
