"use client"

import { AssetManager } from "@/components/asset-manager"
import { Sidebar } from "@/components/sidebar"
import { Toaster } from "@/components/ui/toaster"

export default function AssetManagerPage() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background p-6">
        <AssetManager />
      </main>
      <Toaster />
    </div>
  )
}
