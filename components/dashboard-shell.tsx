"use client"

import type { ReactNode } from "react"
import { Sidebar, MobileMenuButton } from "@/components/sidebar"
import { Toaster } from "@/components/ui/toaster"
import { noc } from "@/lib/noc-design"
import { cn } from "@/lib/utils"

export function DashboardShell({
  children,
  className,
  contentClassName,
}: {
  children: ReactNode
  className?: string
  contentClassName?: string
}) {
  return (
    <div className={cn("flex h-screen overflow-hidden", noc.canvas, className)}>
      <Sidebar />
      <main className={cn("relative flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 lg:px-8", contentClassName)}>
        <div className="pointer-events-none fixed left-4 top-4 z-20 md:hidden">
          <div className="pointer-events-auto">
            <MobileMenuButton />
          </div>
        </div>
        <div className="w-full pt-10 md:pt-0">{children}</div>
      </main>
      <Toaster />
    </div>
  )
}
