"use client"

import { useCallback, useEffect, useState } from "react"
import { PUBLIC_REGISTER_PASSCODE_SESSION_KEY } from "@/lib/public-action-passcode"

export function useRegisterPasscode(verifyPath: string) {
  const [passcode, setPasscode] = useState("")
  const [passcodeError, setPasscodeError] = useState("")
  const [unlocked, setUnlocked] = useState(false)
  const [gateReady, setGateReady] = useState(false)
  const [loading, setLoading] = useState(false)

  const verifyPasscode = useCallback(
    async (code: string) => {
      const trimmed = code.trim()
      if (!trimmed) return false
      setLoading(true)
      setPasscodeError("")
      try {
        const qs = new URLSearchParams()
        qs.set("passcode", trimmed)
        qs.set("ts", String(Date.now()))
        const res = await fetch(`${verifyPath}?${qs}`, { cache: "no-store" })
        const json = await res.json().catch(() => ({}))
        if (res.status === 401) {
          setPasscodeError(json?.error || "We mzee... wrong code 😄")
          setUnlocked(false)
          sessionStorage.removeItem(PUBLIC_REGISTER_PASSCODE_SESSION_KEY)
          return false
        }
        if (!res.ok) {
          setPasscodeError(json?.error || "Could not verify passcode")
          return false
        }
        sessionStorage.setItem(PUBLIC_REGISTER_PASSCODE_SESSION_KEY, trimmed)
        setPasscode(trimmed)
        setUnlocked(true)
        return true
      } finally {
        setLoading(false)
      }
    },
    [verifyPath]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const saved = sessionStorage.getItem(PUBLIC_REGISTER_PASSCODE_SESSION_KEY)
        if (saved?.trim()) {
          setPasscode(saved)
          const ok = await verifyPasscode(saved)
          if (!cancelled && !ok) setPasscode(saved)
        }
      } finally {
        if (!cancelled) setGateReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [verifyPasscode])

  const tryUnlock = useCallback(async () => {
    await verifyPasscode(passcode)
  }, [passcode, verifyPasscode])

  return {
    passcode,
    setPasscode,
    passcodeError,
    unlocked,
    gateReady,
    loading,
    tryUnlock,
  }
}
