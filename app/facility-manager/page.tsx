"use client"

import { FacilityManager } from "@/components/facility-manager"
import { Sidebar } from "@/components/sidebar"
import { Toaster } from "@/components/ui/toaster"

export default function FacilityManagerPage() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background p-6">
        <FacilityManager />
      </main>
      <Toaster />
    </div>
  )
}
