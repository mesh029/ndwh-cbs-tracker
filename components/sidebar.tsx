"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Building2, FileText, Ticket, MapPin, Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "./theme-toggle"

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Facility Manager", href: "/facility-manager", icon: Building2 },
  { name: "Uploads", href: "/uploads", icon: Upload },
  { name: "Reports", href: "/reports", icon: FileText },
  { name: "EMR Server Tickets", href: "/tickets", icon: Ticket },
  { name: "Nyamira Dashboard", href: "/nyamira", icon: MapPin },
]

const AUTO_HIDE_DELAY = 2000 // 2 seconds

export function Sidebar() {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Auto-collapse sidebar to icons after 2 seconds of no interaction
  useEffect(() => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Don't auto-collapse if hovered
    if (isHovered) {
      return
    }

    // Set timeout to collapse to icons
    timeoutRef.current = setTimeout(() => {
      setIsCollapsed(true)
    }, AUTO_HIDE_DELAY)

    // Cleanup on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [isHovered, isCollapsed])

  // Reset when pathname changes - show full sidebar on navigation
  useEffect(() => {
    setIsCollapsed(false)
    // Clear timeout on navigation
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
  }, [pathname])

  const handleMouseEnter = () => {
    setIsHovered(true)
    // Clear auto-hide when hovering
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    // Expand if collapsed
    if (isCollapsed) {
      setIsCollapsed(false)
    }
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
    // Restart auto-collapse timer
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(() => {
      setIsCollapsed(true)
    }, AUTO_HIDE_DELAY)
  }

  return (
    <div
      className={cn(
        "flex h-full flex-col border-r bg-card transition-all duration-300 ease-in-out",
        isCollapsed ? "w-16" : "w-64"
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex h-16 items-center justify-between border-b px-2 sm:px-4 relative gap-2">
        {!isCollapsed && (
          <h1 className="text-lg sm:text-xl font-bold text-primary whitespace-nowrap truncate flex-1 min-w-0">
            Facility Dashboard
          </h1>
        )}
        {isCollapsed && (
          <div className="flex items-center justify-center w-full">
            <ThemeToggle />
          </div>
        )}
        {!isCollapsed && (
          <div className="hidden sm:block shrink-0">
            <ThemeToggle />
          </div>
        )}
      </div>
      <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                isCollapsed && "justify-center"
              )}
              title={isCollapsed ? item.name : undefined}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span className="whitespace-nowrap">{item.name}</span>}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
