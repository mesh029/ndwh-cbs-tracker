"use client"

import { useState } from "react"
import { flushSync } from "react-dom"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { APP_VERSION } from "@/lib/version"
import { Badge } from "@/components/ui/badge"

export default function LoginPage() {
  const router = useRouter()
  const { refresh, beginAuthTransition, endAuthTransition, notifyAuthNavigationTarget } = useAuth()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    flushSync(() => {
      beginAuthTransition()
    })
    setError("")
    setIsLoading(true)
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Invalid credentials")
      }
      // Ensure the sidebar/header updates immediately after cookies are set.
      await refresh()
      const dest = data.redirectTo || "/nyamira"
      notifyAuthNavigationTarget(dest)
      router.push(dest)
      router.refresh()
      // Overlay stays until destination route is active and paint/idle (see AuthNavigationReadyWatcher).
    } catch (err) {
      endAuthTransition()
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-2xl">PATH HIS</CardTitle>
            <Badge variant="outline" className="text-xs">v{APP_VERSION}</Badge>
          </div>
          <CardDescription>Sign in to access the system</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Email</label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="name@path.org" required />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Password</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
