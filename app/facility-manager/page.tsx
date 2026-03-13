"use client"

import { FacilityManager } from "@/components/facility-manager"
import { Sidebar, MobileMenuButton } from "@/components/sidebar"
import { Toaster } from "@/components/ui/toaster"

export default function FacilityManagerPage() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background p-6">
        <div className="md:hidden fixed top-4 left-4 z-10">
          <MobileMenuButton />
        </div>
        <FacilityManager />
      </main>
      <Toaster />
    </div>
  )
}
