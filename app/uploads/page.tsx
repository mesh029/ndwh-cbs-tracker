"use client"

import { Sidebar, MobileMenuButton } from "@/components/sidebar"
import { Toaster } from "@/components/ui/toaster"
import { UploadsPage } from "@/components/uploads-page"

export default function Uploads() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background p-6">
        <div className="md:hidden fixed top-4 left-4 z-10">
          <MobileMenuButton />
        </div>
        <UploadsPage />
      </main>
      <Toaster />
    </div>
  )
}
