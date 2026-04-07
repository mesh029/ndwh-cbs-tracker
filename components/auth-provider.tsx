"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import type { UserRole } from "@/lib/auth"

interface AuthContextValue {
  role: UserRole | null
  username: string | null
  email: string | null
  access: { locations: "all" | string[]; modules: string[] } | null
  loading: boolean
  refresh: () => Promise<void>
  clearAuth: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [access, setAccess] = useState<{ locations: "all" | string[]; modules: string[] } | null>(null)
  const [loading, setLoading] = useState(true)

  const loadRole = async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.role) {
        setRole(data.role)
        setUsername(data.username || null)
        setEmail(data.email || null)
        setAccess(data.access || null)
      } else {
        setRole(null)
        setUsername(null)
        setEmail(null)
        setAccess(null)
      }
    } catch {
      setRole(null)
      setUsername(null)
      setEmail(null)
      setAccess(null)
    } finally {
      setLoading(false)
    }
  }

  const clearAuth = () => {
    setRole(null)
    setUsername(null)
    setEmail(null)
    setAccess(null)
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false

    const initialLoad = async () => {
      if (!cancelled) {
        setLoading(true)
      }
      await loadRole()
    }

    initialLoad()

    // Also refresh on visibility/focus so role updates after login/logout
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setLoading(true)
        loadRole()
      }
    }
    const handleFocus = () => {
      setLoading(true)
      loadRole()
    }

    window.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", handleFocus)

    return () => {
      cancelled = true
      window.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", handleFocus)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ role, username, email, access, loading, refresh: loadRole, clearAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return ctx
}
