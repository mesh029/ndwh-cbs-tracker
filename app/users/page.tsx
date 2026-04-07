"use client"

import { useEffect, useState } from "react"
import { Sidebar, MobileMenuButton } from "@/components/sidebar"
import { Toaster } from "@/components/ui/toaster"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"

export default function UsersPage() {
  const { toast } = useToast()
  const [users, setUsers] = useState<any[]>([])
  const [locations, setLocations] = useState<string[]>([])
  const [modules, setModules] = useState<string[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState<any>({ name: "", email: "", password: "", role: "guest", locations: "all", modules: ["tickets"] })

  const load = async () => {
    const res = await fetch(`/api/users?ts=${Date.now()}`, { cache: "no-store" })
    if (!res.ok) return
    const data = await res.json()
    setUsers(data.users || [])
    setLocations(data.locations || [])
    setModules(data.modules || [])
  }

  useEffect(() => {
    load()
  }, [])

  const createUser = async () => {
    if (isCreating) return
    if (!String(form.name || "").trim()) {
      toast({ title: "Missing name", description: "Please enter full name", variant: "destructive" })
      return
    }
    if (!String(form.email || "").trim() || !String(form.email).includes("@")) {
      toast({ title: "Invalid email", description: "Please enter a valid email address", variant: "destructive" })
      return
    }
    if (!String(form.password || "").trim() || String(form.password).length < 6) {
      toast({ title: "Weak password", description: "Password must be at least 6 characters", variant: "destructive" })
      return
    }
    if (form.locations !== "all" && (!Array.isArray(form.locations) || form.locations.length === 0)) {
      toast({ title: "No location selected", description: "Pick at least one location for custom scope", variant: "destructive" })
      return
    }
    if (!Array.isArray(form.modules) || form.modules.length === 0) {
      toast({ title: "No module selected", description: "Pick at least one module", variant: "destructive" })
      return
    }

    setIsCreating(true)
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const message =
          res.status === 409
            ? "User already exists with this email"
            : data.error || "Failed to create user"
        toast({ title: "Error", description: message, variant: "destructive" })
        return
      }

      if (data.user) {
        setUsers((prev) => [data.user, ...prev.filter((u) => u.id !== data.user.id)])
      } else {
        await load()
      }
      toast({ title: "Success", description: "User created successfully" })
      setForm({ name: "", email: "", password: "", role: "guest", locations: "all", modules: ["tickets"] })
      await load()
    } finally {
      setIsCreating(false)
    }
  }

  const toggleLocation = (location: string) => {
    if (form.locations === "all") return
    const current: string[] = form.locations || []
    if (current.includes(location)) {
      setForm({ ...form, locations: current.filter((l) => l !== location) })
      return
    }
    setForm({ ...form, locations: [...current, location] })
  }

  const toggleModule = (moduleName: string) => {
    const current: string[] = form.modules || []
    if (current.includes(moduleName)) {
      setForm({ ...form, modules: current.filter((m) => m !== moduleName) })
      return
    }
    setForm({ ...form, modules: [...current, moduleName] })
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background p-6">
        <div className="md:hidden fixed top-4 left-4 z-10">
          <MobileMenuButton />
        </div>
        <div className="space-y-6">
          <h1 className="text-3xl font-bold">User Access Management</h1>
          <Card>
            <CardHeader><CardTitle>Create User</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input placeholder="Email (login username)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="guest">Guest</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="superadmin">Superadmin</SelectItem>
                </SelectContent>
              </Select>
              <Select value={form.locations === "all" ? "all" : "custom"} onValueChange={(v) => setForm({ ...form, locations: v === "all" ? "all" : [] })}>
                <SelectTrigger><SelectValue placeholder="Location scope" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  <SelectItem value="custom">Specific locations</SelectItem>
                </SelectContent>
              </Select>
              {form.locations !== "all" && (
                <div className="rounded-md border p-3 md:col-span-2">
                  <p className="text-sm font-medium mb-2">Allowed Locations (multi-select)</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {locations.map((l) => (
                      <label key={l} className="text-sm flex items-center gap-2 rounded border px-2 py-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(form.locations || []).includes(l)}
                          onChange={() => toggleLocation(l)}
                        />
                        <span>{l}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Selected: {(form.locations || []).length} location(s)
                  </p>
                </div>
              )}
              <div className="rounded-md border p-3 md:col-span-2">
                <p className="text-sm font-medium mb-2">Module Access (multi-select)</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {modules.map((m) => (
                    <label key={m} className="text-sm flex items-center gap-2 rounded border px-2 py-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(form.modules || []).includes(m)}
                        onChange={() => toggleModule(m)}
                      />
                      <span>{m}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Selected: {(form.modules || []).length} module(s)
                </p>
              </div>
              <Button onClick={createUser} disabled={isCreating} className="md:col-span-2">
                {isCreating ? "Creating user..." : "Create User"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Existing Users</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {users.map((u) => (
                  <div key={u.id} className="border rounded p-3 text-sm">
                    <div className="font-medium">{u.name} ({u.email})</div>
                    <div>Role: {u.role}</div>
                    <div>Locations: {u.locations === "all" ? "all" : (u.locations || []).join(", ")}</div>
                    <div>Modules: {(u.modules || []).join(", ")}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Toaster />
    </div>
  )
}
