"use client"

import { AssetTypeAdmin } from "@/components/asset-type-admin"
import { Sidebar, MobileMenuButton } from "@/components/sidebar"
import { Toaster } from "@/components/ui/toaster"
import { useAuth } from "@/components/auth-provider"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export default function AssetTypesPage() {
  const { role } = useAuth()

  if (role !== "superadmin") {
    return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          <p className="text-muted-foreground">Superadmin access required to manage custom asset types.</p>
          <Button className="mt-4" asChild>
            <Link href="/asset-manager">Back to Asset Manager</Link>
          </Button>
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background px-3 py-4 sm:px-4 md:px-6">
        <div className="md:hidden fixed top-3 left-3 z-20">
          <MobileMenuButton />
        </div>
        <div className="mx-auto w-full max-w-4xl pt-10 md:pt-0 space-y-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/asset-manager">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Asset Manager
            </Link>
          </Button>
          <AssetTypeAdmin />
        </div>
      </main>
      <Toaster />
    </div>
  )
}
