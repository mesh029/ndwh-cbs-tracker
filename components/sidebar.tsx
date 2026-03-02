"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LayoutDashboard, Building2, FileText, Ticket, MapPin, Upload, ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "./theme-toggle"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  section?: string
}

interface NavSection {
  title: string
  icon: React.ComponentType<{ className?: string }>
  items: NavItem[]
  defaultOpen?: boolean
}

const navigationSections: NavSection[] = [
  {
    title: "NDWH/CBS Monitoring",
    icon: LayoutDashboard,
    items: [
      { name: "Dashboard", href: "/", icon: LayoutDashboard },
      { name: "Uploads", href: "/uploads", icon: Upload },
    ],
    defaultOpen: true,
  },
  {
    title: "EMR Management",
    icon: Building2,
    items: [
      { name: "Facility Manager", href: "/facility-manager", icon: Building2 },
      { name: "Asset Manager", href: "/asset-manager", icon: Building2 },
      { name: "EMR Tickets", href: "/tickets", icon: Ticket },
      { name: "County Dashboard", href: "/nyamira", icon: MapPin },
    ],
    defaultOpen: true,
  },
  {
    title: "Reports",
    icon: FileText,
    items: [
      { name: "Reports", href: "/reports", icon: FileText },
    ],
    defaultOpen: true,
  },
]

const AUTO_HIDE_DELAY = 5000 // 5 seconds - increased delay for better UX

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [role, setRole] = useState<"admin" | "guest" | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(navigationSections.map((section, index) => `section-${index}`))
  )
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

  useEffect(() => {
    const loadRole = async () => {
      try {
        const res = await fetch("/api/auth/me")
        const data = await res.json()
        if (res.ok && data.role) {
          setRole(data.role)
        }
      } catch (error) {
        setRole(null)
      }
    }
    loadRole()
  }, [])

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
      router.push("/login")
      router.refresh()
    } catch {
      router.push("/login")
    }
  }

  const visibleSections =
    role === "guest"
      ? navigationSections
          .map((section) => ({
            ...section,
            items: section.items.filter((item) => item.href === "/tickets"),
          }))
          .filter((section) => section.items.length > 0)
      : navigationSections

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
      <nav className="flex-1 space-y-2 p-4 overflow-y-auto">
        {visibleSections.map((section, sectionIndex) => {
          const sectionId = `section-${sectionIndex}`
          const isExpanded = expandedSections.has(sectionId)
          const hasActiveItem = section.items.some(item => pathname === item.href)

          const toggleSection = () => {
            setExpandedSections(prev => {
              const next = new Set(prev)
              if (next.has(sectionId)) {
                next.delete(sectionId)
              } else {
                next.add(sectionId)
              }
              return next
            })
          }

          return (
            <div key={sectionId} className="space-y-1">
              {/* Section Header */}
              {!isCollapsed ? (
                <button
                  onClick={toggleSection}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors",
                    "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <section.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{section.title}</span>
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  )}
                </button>
              ) : (
                <div className="px-3 py-1">
                  <section.icon className="h-4 w-4 text-muted-foreground" />
                </div>
              )}

              {/* Section Items */}
              {(!isCollapsed && isExpanded) && (
                <div className="ml-4 space-y-1 border-l-2 border-muted pl-3">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="whitespace-nowrap">{item.name}</span>
                      </Link>
                    )
                  })}
                </div>
              )}

              {/* Collapsed: Show all items as icons */}
              {isCollapsed && (
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={cn(
                          "flex items-center justify-center rounded-lg p-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        )}
                        title={item.name}
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>
      <div className="border-t p-3 space-y-2">
        {!isCollapsed && role && (
          <Badge variant={role === "admin" ? "default" : "secondary"} className="w-full justify-center">
            {role.toUpperCase()}
          </Badge>
        )}
        <Button variant="outline" size={isCollapsed ? "icon" : "sm"} className="w-full" onClick={handleLogout}>
          {isCollapsed ? "⎋" : "Logout"}
        </Button>
      </div>
    </div>
  )
}
