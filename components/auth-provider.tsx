"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import type { UserRole } from "@/lib/auth"

interface AuthContextValue {
  role: UserRole | null
  username: string | null
  loading: boolean
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadRole = async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.role) {
        setRole(data.role)
        setUsername(data.username || null)
      } else {
        setRole(null)
        setUsername(null)
      }
    } catch {
      setRole(null)
      setUsername(null)
    } finally {
      setLoading(false)
    }
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
    <AuthContext.Provider value={{ role, username, loading, refresh: loadRole }}>
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
