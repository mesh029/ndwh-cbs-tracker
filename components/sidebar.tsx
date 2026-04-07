"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard, Building2, FileText, Ticket, MapPin,
  Upload, ChevronDown, ChevronRight, Menu, Database,
  LogOut, Shield, UserCheck, Eye,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "./theme-toggle"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/components/ui/use-toast"
import { APP_VERSION } from "@/lib/version"

// ─── Nav structure ─────────────────────────────────────────────────────────

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  roles: Array<"superadmin" | "admin" | "guest">
  module?: string
}

interface NavSection {
  title: string
  icon: React.ComponentType<{ className?: string }>
  items: NavItem[]
  defaultOpen?: boolean
}

const navigationSections: NavSection[] = [
  {
    title: "Dashboards",
    icon: LayoutDashboard,
    items: [
      { name: "Home",       href: "/",        icon: LayoutDashboard, roles: ["superadmin", "admin"] },
      { name: "Uploads",    href: "/uploads",  icon: Upload,          roles: ["superadmin"] },
    ],
    defaultOpen: true,
  },
  {
    title: "EMR & Assets",
    icon: Building2,
    items: [
      { name: "Facility Manager", href: "/facility-manager", icon: Building2, roles: ["superadmin", "admin"] },
      { name: "Assets",           href: "/asset-manager",    icon: Building2, roles: ["superadmin", "admin"], module: "assets" },
      { name: "EMR Tickets",      href: "/tickets",          icon: Ticket,    roles: ["superadmin", "admin", "guest"], module: "tickets" },
      { name: "County Dashboard", href: "/nyamira",          icon: MapPin,    roles: ["superadmin", "admin"], module: "dashboard" },
      { name: "Users",            href: "/users",            icon: UserCheck, roles: ["superadmin"], module: "users" },
    ],
    defaultOpen: true,
  },
  {
    title: "Reports",
    icon: FileText,
    items: [
      { name: "Reports", href: "/reports", icon: FileText, roles: ["superadmin", "admin"], module: "reports" },
    ],
    defaultOpen: true,
  },
]

// ─── Role helpers ────────────────────────────────────────────────────────────

type UserRole = "superadmin" | "admin" | "guest"

function getRoleBadgeStyle(role: UserRole | null) {
  if (role === "superadmin")
    return "bg-red-600 text-white border-red-600 hover:bg-red-600"
  if (role === "admin")
    return "bg-blue-600 text-white border-blue-600 hover:bg-blue-600"
  return "bg-gray-500 text-white border-gray-500 hover:bg-gray-500"
}

function getRoleLabel(role: UserRole | null) {
  if (role === "superadmin") return "Super Admin"
  if (role === "admin") return "Admin"
  return "Guest"
}

function getRoleIcon(role: UserRole | null) {
  if (role === "superadmin") return Shield
  if (role === "admin") return UserCheck
  return Eye
}

function getEffectiveModules(role: UserRole, access: { modules: string[] } | null): string[] {
  if (role === "superadmin") return ["dashboard", "tickets", "assets", "facility", "reports", "uploads", "users"]
  if (role === "admin") {
    if (Array.isArray(access?.modules) && access.modules.length > 0) return access.modules
    return ["dashboard", "tickets", "assets", "facility", "reports"]
  }
  if (Array.isArray(access?.modules) && access.modules.length > 0) return access.modules
  return ["tickets"]
}

function getFilteredSections(role: UserRole | null, access: { modules: string[] } | null) {
  if (!role) return []
  const modules = getEffectiveModules(role, access)
  return navigationSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.roles.includes(role) && (!item.module || modules.includes(item.module))),
    }))
    .filter((section) => section.items.length > 0)
}

const AUTO_HIDE_DELAY = 5000

// ─── Main Sidebar ────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { role, username, access, refresh } = useAuth()
  const { toast } = useToast()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(navigationSections.map((_, i) => `section-${i}`))
  )
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (isHovered) return
    timeoutRef.current = setTimeout(() => setIsCollapsed(true), AUTO_HIDE_DELAY)
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [isHovered, isCollapsed])

  useEffect(() => {
    setIsCollapsed(false)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [pathname])

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
      // Ensure the sidebar updates immediately after cookies are cleared.
      await refresh()
      router.push("/")
      router.refresh()
    } catch {
      router.push("/")
    }
  }

  const handleBackup = async () => {
    toast({ title: "Preparing backup…", description: "Your SQL file will download shortly." })
    try {
      const res = await fetch("/api/backup")
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Backup failed")
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `his_backup_${new Date().toISOString().slice(0, 10)}.sql`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast({ title: "✅ Backup downloaded", description: "SQL file saved to your downloads." })
    } catch (err) {
      toast({
        title: "Backup failed",
        description: err instanceof Error ? err.message : "Could not generate backup",
        variant: "destructive",
      })
    }
  }

  const handleMouseEnter = () => {
    setIsHovered(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (isCollapsed) setIsCollapsed(false)
  }

  const handleMouseLeave = () => {
    setIsHovered(false)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setIsCollapsed(true), AUTO_HIDE_DELAY)
  }

  const visibleSections = getFilteredSections(role as UserRole | null, access)
  const RoleIcon = getRoleIcon(role as UserRole | null)

  return (
    <div
      className={cn(
        "hidden md:flex h-full flex-col border-r bg-card transition-all duration-300 ease-in-out",
        isCollapsed ? "w-16" : "w-64"
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b px-2 sm:px-4 relative gap-2">
        {!isCollapsed && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-primary whitespace-nowrap truncate">
              PATH HIS
            </h1>
            <Badge variant="outline" className="text-[10px] h-5 px-2 shrink-0">v{APP_VERSION}</Badge>
          </div>
        )}
        {isCollapsed ? (
          <div className="flex items-center justify-center w-full">
            <ThemeToggle />
          </div>
        ) : (
          <div className="hidden sm:block shrink-0">
            <ThemeToggle />
          </div>
        )}
      </div>

      {/* Role card — shown when expanded */}
      {!isCollapsed && role && (
        <div className={cn(
          "mx-3 mt-3 mb-1 rounded-lg p-3 border",
          role === "superadmin" && "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
          role === "admin"      && "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
          role === "guest"      && "bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700",
        )}>
          <div className="flex items-center gap-2">
            <RoleIcon className={cn(
              "h-4 w-4 shrink-0",
              role === "superadmin" && "text-red-600",
              role === "admin"      && "text-blue-600",
              role === "guest"      && "text-gray-500",
            )} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider truncate"
                style={{ color: role === "superadmin" ? "#dc2626" : role === "admin" ? "#2563eb" : "#6b7280" }}>
                {getRoleLabel(role as UserRole)}
              </p>
              {username && (
                <p className="text-xs text-muted-foreground truncate">{username}</p>
              )}
            </div>
          </div>
          {/* Permissions summary */}
          <p className="text-[10px] text-muted-foreground mt-1.5 leading-tight">
            {role === "superadmin" && "Full access · uploads · backups · all tickets"}
            {role === "admin"      && "Scoped access by module and location"}
            {role === "guest"      && "Scoped ticket access"}
          </p>
          {access && (
            <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
              Locations: {access.locations === "all" ? "all" : access.locations.join(", ")}
            </p>
          )}
        </div>
      )}

      {/* Role icon in collapsed mode */}
      {isCollapsed && role && (
        <div className="flex justify-center mt-3 mb-1">
          <div className={cn(
            "p-1.5 rounded-full",
            role === "superadmin" && "bg-red-100 dark:bg-red-950",
            role === "admin"      && "bg-blue-100 dark:bg-blue-950",
            role === "guest"      && "bg-gray-100 dark:bg-gray-800",
          )}>
            <RoleIcon className={cn(
              "h-4 w-4",
              role === "superadmin" && "text-red-600",
              role === "admin"      && "text-blue-600",
              role === "guest"      && "text-gray-500",
            )} />
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-2 p-4 overflow-y-auto">
        {visibleSections.map((section, sectionIndex) => {
          const sectionId = `section-${sectionIndex}`
          const isExpanded = expandedSections.has(sectionId)

          const toggleSection = () => {
            setExpandedSections(prev => {
              const next = new Set(prev)
              next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId)
              return next
            })
          }

          return (
            <div key={sectionId} className="space-y-1">
              {!isCollapsed ? (
                <button
                  onClick={toggleSection}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <section.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{section.title}</span>
                  {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                </button>
              ) : (
                <div className="px-3 py-1">
                  <section.icon className="h-4 w-4 text-muted-foreground" />
                </div>
              )}

              {!isCollapsed && isExpanded && (
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

      {/* Footer */}
      <div className="border-t p-3 space-y-2">
        {/* Backup button — superadmin only */}
        {role === "superadmin" && !isCollapsed && (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs border-red-300 text-red-700 hover:bg-red-50 dark:hover:bg-red-950 dark:border-red-700 dark:text-red-400"
            onClick={handleBackup}
          >
            <Database className="mr-2 h-3.5 w-3.5" />
            Download SQL Backup
          </Button>
        )}
        {role === "superadmin" && isCollapsed && (
          <button
            onClick={handleBackup}
            title="Download SQL Backup"
            className="flex w-full items-center justify-center rounded-lg p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
          >
            <Database className="h-5 w-5" />
          </button>
        )}

        <Button
          variant="outline"
          size={isCollapsed ? "icon" : "sm"}
          className="w-full"
          onClick={handleLogout}
        >
          <LogOut className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
          {!isCollapsed && "Logout"}
        </Button>
      </div>
    </div>
  )
}

// ─── Shared sidebar content (mobile) ─────────────────────────────────────────

function SidebarContent({
  onLinkClick,
  role,
  username,
  pathname,
  visibleSections,
  expandedSections,
  setExpandedSections,
  handleLogout,
  handleBackup,
}: {
  onLinkClick?: () => void
  role: UserRole | null
  username: string | null
  pathname: string
  visibleSections: typeof navigationSections
  expandedSections: Set<string>
  setExpandedSections: React.Dispatch<React.SetStateAction<Set<string>>>
  handleLogout: () => void
  handleBackup: () => void
}) {
  const RoleIcon = getRoleIcon(role)

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId)
      return next
    })
  }

  return (
    <>
      <div className="flex h-16 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-lg font-bold text-primary truncate">PATH HIS</h1>
          <Badge variant="outline" className="text-[10px] h-5 px-2 shrink-0">v{APP_VERSION}</Badge>
        </div>
        <ThemeToggle />
      </div>

      {/* Role card */}
      {role && (
        <div className={cn(
          "mx-3 mt-3 mb-1 rounded-lg p-3 border",
          role === "superadmin" && "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
          role === "admin"      && "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
          role === "guest"      && "bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700",
        )}>
          <div className="flex items-center gap-2">
            <RoleIcon className={cn(
              "h-4 w-4 shrink-0",
              role === "superadmin" && "text-red-600",
              role === "admin"      && "text-blue-600",
              role === "guest"      && "text-gray-500",
            )} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider"
                style={{ color: role === "superadmin" ? "#dc2626" : role === "admin" ? "#2563eb" : "#6b7280" }}>
                {getRoleLabel(role)}
              </p>
              {username && <p className="text-xs text-muted-foreground truncate">{username}</p>}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 leading-tight">
            {role === "superadmin" && "Full access · uploads · backups · all tickets"}
            {role === "admin"      && "Create · edit · resolve tickets · view reports"}
            {role === "guest"      && "Create tickets only · read-only access"}
          </p>
        </div>
      )}

      <nav className="flex-1 space-y-2 p-4 overflow-y-auto">
        {visibleSections.map((section, sectionIndex) => {
          const sectionId = `section-${sectionIndex}`
          const isExpanded = expandedSections.has(sectionId)

          return (
            <div key={sectionId} className="space-y-1">
              <button
                onClick={() => toggleSection(sectionId)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <section.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{section.title}</span>
                {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              </button>

              {isExpanded && (
                <div className="ml-4 space-y-1 border-l-2 border-muted pl-3">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={onLinkClick}
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
            </div>
          )
        })}
      </nav>

      <div className="border-t p-3 space-y-2">
        {role === "superadmin" && (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs border-red-300 text-red-700 hover:bg-red-50 dark:hover:bg-red-950 dark:border-red-700 dark:text-red-400"
            onClick={handleBackup}
          >
            <Database className="mr-2 h-3.5 w-3.5" />
            Download SQL Backup
          </Button>
        )}
        <Button variant="outline" size="sm" className="w-full" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>
    </>
  )
}

// ─── Mobile Menu Button ───────────────────────────────────────────────────────

export function MobileMenuButton() {
  const pathname = usePathname()
  const router = useRouter()
  const { role, username, access, refresh } = useAuth()
  const { toast } = useToast()
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(navigationSections.map((_, i) => `section-${i}`))
  )
  const [open, setOpen] = useState(false)

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
      // Ensure the mobile sidebar updates immediately after cookies are cleared.
      await refresh()
      router.push("/")
      router.refresh()
      setOpen(false)
    } catch {
      router.push("/")
      setOpen(false)
    }
  }

  const handleBackup = async () => {
    setOpen(false)
    toast({ title: "Preparing backup…", description: "Your SQL file will download shortly." })
    try {
      const res = await fetch("/api/backup")
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Backup failed")
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `his_backup_${new Date().toISOString().slice(0, 10)}.sql`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast({ title: "✅ Backup downloaded", description: "SQL file saved to your downloads." })
    } catch (err) {
      toast({
        title: "Backup failed",
        description: err instanceof Error ? err.message : "Could not generate backup",
        variant: "destructive",
      })
    }
  }

  const visibleSections = getFilteredSections(role as UserRole | null, access)

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-6 w-6" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 flex flex-col">
        <SidebarContent
          onLinkClick={() => setOpen(false)}
          role={role as UserRole | null}
          username={username}
          pathname={pathname}
          visibleSections={visibleSections}
          expandedSections={expandedSections}
          setExpandedSections={setExpandedSections}
          handleLogout={handleLogout}
          handleBackup={handleBackup}
        />
      </SheetContent>
    </Sheet>
  )
}
