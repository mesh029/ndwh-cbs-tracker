"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import type { UserRole } from "@/lib/auth"

interface AuthContextValue {
  role: UserRole | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const loadRole = async () => {
      try {
        const res = await fetch("/api/auth/me")
        const data = await res.json()
        if (!cancelled && res.ok && data.role) {
          setRole(data.role)
        }
      } catch (_) {
        if (!cancelled) {
          setRole(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadRole()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <AuthContext.Provider value={{ role, loading }}>
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

