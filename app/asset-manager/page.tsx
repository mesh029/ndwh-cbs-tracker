"use client"

import { AssetManager } from "@/components/asset-manager"
import { Sidebar, MobileMenuButton } from "@/components/sidebar"
import { Toaster } from "@/components/ui/toaster"

export default function AssetManagerPage() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background px-3 py-4 sm:px-4 md:px-6">
        <div className="md:hidden fixed top-3 left-3 z-20">
          <MobileMenuButton />
        </div>
        <div className="mx-auto w-full max-w-[1800px] pt-10 md:pt-0">
          <AssetManager />
        </div>
      </main>
      <Toaster />
    </div>
  )
}
