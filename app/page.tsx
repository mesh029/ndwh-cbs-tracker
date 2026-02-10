"use client"

import { Dashboard } from "@/components/dashboard"
import { Sidebar } from "@/components/sidebar"
import { Toaster } from "@/components/ui/toaster"

export default function Home() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background p-6">
        <Dashboard />
      </main>
      <Toaster />
    </div>
  )
}
