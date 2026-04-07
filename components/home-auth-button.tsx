"use client"

import Link from "next/link"
import { flushSync } from "react-dom"
import { useRouter } from "next/navigation"
import { LogIn, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/components/auth-provider"

export function HomeAuthButton() {
  const router = useRouter()
  const { role, clearAuth, beginAuthTransition, notifyAuthNavigationTarget, markAuthServerRefreshComplete } = useAuth()

  const handleLogout = () => {
    flushSync(() => {
      beginAuthTransition()
    })
    notifyAuthNavigationTarget("/", { waitForServerRefresh: true })
    clearAuth()
    router.push("/")
    void fetch("/api/auth/logout", { method: "POST", keepalive: true }).finally(() => {
      router.refresh()
      requestAnimationFrame(() => {
        requestAnimationFrame(() => markAuthServerRefreshComplete())
      })
    })
  }

  if (!role) {
    return (
      <Button asChild size="sm" variant="secondary">
        <Link href="/login"><LogIn className="mr-2 h-4 w-4" />Login</Link>
      </Button>
    )
  }

  return (
    <Button size="sm" variant="secondary" onClick={handleLogout}>
      <LogOut className="mr-2 h-4 w-4" />
      Logout
    </Button>
  )
}
