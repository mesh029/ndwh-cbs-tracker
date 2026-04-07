"use client"

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react"
import { usePathname } from "next/navigation"
import type { UserRole } from "@/lib/auth"
import { normalizeAppPath } from "@/lib/app-path"
import { AuthLoadingOverlay } from "@/components/auth-loading-overlay"

interface AuthContextValue {
  role: UserRole | null
  username: string | null
  email: string | null
  access: { locations: "all" | string[]; modules: string[] } | null
  loading: boolean
  authTransitionLoading: boolean
  refresh: () => Promise<void>
  clearAuth: () => void
  beginAuthTransition: () => void
  endAuthTransition: () => void
  /** Call before router.push — overlay stays until destination route is ready. */
  notifyAuthNavigationTarget: (
    to: string,
    options?: { waitForServerRefresh?: boolean; stopOnPathMatch?: boolean }
  ) => void
  /** After logout: call from fetch.finally after router.refresh() so home RSC can apply before hiding overlay. */
  markAuthServerRefreshComplete: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function scheduleWhenDocumentReady(cb: () => void) {
  const run = () => {
    if (typeof document === "undefined") {
      cb()
      return
    }
    if (document.readyState === "complete") cb()
    else window.addEventListener("load", cb, { once: true })
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(run)
  })
}

function scheduleAfterPaintAndIdle(onDone: () => void) {
  let finished = false
  const done = () => {
    if (finished) return
    finished = true
    onDone()
  }
  scheduleWhenDocumentReady(() => {
    if (typeof window === "undefined") {
      done()
      return
    }
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => done(), { timeout: 2500 })
    } else {
      setTimeout(done, 450)
    }
  })
}

function AuthNavigationReadyWatcher({
  pendingAuthDestination,
  authTransitionLoading,
  waitForServerRefresh,
  stopOnPathMatch,
  onReady,
  onFailSafeClear,
}: {
  pendingAuthDestination: string | null
  authTransitionLoading: boolean
  waitForServerRefresh: boolean
  stopOnPathMatch: boolean
  onReady: () => void
  onFailSafeClear: () => void
}) {
  const pathname = usePathname()

  useEffect(() => {
    if (!pendingAuthDestination || !authTransitionLoading) return

    const target = pendingAuthDestination
    const here = normalizeAppPath(pathname)
    if (here === "/login") return
    if (here !== target) return

    let cancelled = false
    const finish = () => {
      if (cancelled) return
      onReady()
    }

    if (stopOnPathMatch && !waitForServerRefresh) {
      finish()
      return
    }

    // Logout path: wait until caller confirms server refresh has been applied.
    if (!waitForServerRefresh) {
      scheduleAfterPaintAndIdle(finish)
    }

    const failSafe = window.setTimeout(() => {
      if (!cancelled) onFailSafeClear()
    }, 15000)

    return () => {
      cancelled = true
      window.clearTimeout(failSafe)
    }
  }, [pathname, pendingAuthDestination, authTransitionLoading, waitForServerRefresh, stopOnPathMatch, onReady, onFailSafeClear])

  return null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [access, setAccess] = useState<{ locations: "all" | string[]; modules: string[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [authTransitionLoading, setAuthTransitionLoading] = useState(false)
  const authTransitionStartedAtRef = useRef<number | null>(null)
  const [pendingAuthDestination, setPendingAuthDestination] = useState<string | null>(null)
  const [waitForServerRefresh, setWaitForServerRefresh] = useState(false)
  const [stopOnPathMatch, setStopOnPathMatch] = useState(false)

  const beginAuthTransition = () => {
    setPendingAuthDestination(null)
    setWaitForServerRefresh(false)
    setStopOnPathMatch(false)
    authTransitionStartedAtRef.current = Date.now()
    setAuthTransitionLoading(true)
  }

  const endAuthTransition = useCallback(() => {
    const started = authTransitionStartedAtRef.current
    if (started == null) {
      setAuthTransitionLoading(false)
      setPendingAuthDestination(null)
      setWaitForServerRefresh(false)
      setStopOnPathMatch(false)
      return
    }
    const elapsed = Date.now() - started
    const minVisibleMs = 700
    const remaining = Math.max(0, minVisibleMs - elapsed)
    window.setTimeout(() => {
      setAuthTransitionLoading(false)
      authTransitionStartedAtRef.current = null
      setPendingAuthDestination(null)
      setWaitForServerRefresh(false)
      setStopOnPathMatch(false)
    }, remaining)
  }, [])

  const notifyAuthNavigationTarget = useCallback((
    to: string,
    options?: { waitForServerRefresh?: boolean; stopOnPathMatch?: boolean }
  ) => {
    setPendingAuthDestination(normalizeAppPath(to))
    setWaitForServerRefresh(!!options?.waitForServerRefresh)
    setStopOnPathMatch(!!options?.stopOnPathMatch)
  }, [])

  const markAuthServerRefreshComplete = useCallback(() => {
    setWaitForServerRefresh(false)
  }, [])

  const completeAuthNavigation = useCallback(() => {
    setPendingAuthDestination(null)
    setWaitForServerRefresh(false)
    setStopOnPathMatch(false)
    endAuthTransition()
  }, [endAuthTransition])

  useEffect(() => {
    if (!authTransitionLoading) return

    // Hard guard: never allow the auth overlay to block UI indefinitely.
    const hardStop = window.setTimeout(() => {
      setAuthTransitionLoading(false)
      setPendingAuthDestination(null)
      setWaitForServerRefresh(false)
      setStopOnPathMatch(false)
      authTransitionStartedAtRef.current = null
    }, 12000)

    return () => window.clearTimeout(hardStop)
  }, [authTransitionLoading])

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
    <AuthContext.Provider
      value={{
        role,
        username,
        email,
        access,
        loading,
        authTransitionLoading,
        refresh: loadRole,
        clearAuth,
        beginAuthTransition,
        endAuthTransition,
        notifyAuthNavigationTarget,
        markAuthServerRefreshComplete,
      }}
    >
      <AuthNavigationReadyWatcher
        pendingAuthDestination={pendingAuthDestination}
        authTransitionLoading={authTransitionLoading}
        waitForServerRefresh={waitForServerRefresh}
        stopOnPathMatch={stopOnPathMatch}
        onReady={completeAuthNavigation}
        onFailSafeClear={completeAuthNavigation}
      />
      {children}
      <AuthLoadingOverlay visible={authTransitionLoading} />
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
