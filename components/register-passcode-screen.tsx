"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ShieldCheck } from "lucide-react"

type RegisterPasscodeScreenProps = {
  title: string
  description: string
  passcode: string
  passcodeError: string
  loading: boolean
  onPasscodeChange: (value: string) => void
  onUnlock: () => void
  backHref?: string
}

export function RegisterPasscodeScreen({
  title,
  description,
  passcode,
  passcodeError,
  loading,
  onPasscodeChange,
  onUnlock,
  backHref = "/emr-overview",
}: RegisterPasscodeScreenProps) {
  return (
    <main className="flex min-h-[100dvh] flex-col bg-gradient-to-br from-background via-background to-muted/40">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md shadow-lg border-primary/20">
          <CardHeader className="space-y-2 text-center sm:text-left">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 sm:mx-0">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="register-passcode">Action passcode</Label>
              <Input
                id="register-passcode"
                type="password"
                inputMode="text"
                autoComplete="current-password"
                autoFocus
                placeholder="Enter passcode"
                value={passcode}
                onChange={(e) => onPasscodeChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && passcode.trim() && onUnlock()}
                className="text-base"
              />
            </div>
            {passcodeError ? <p className="text-sm text-red-600">{passcodeError}</p> : null}
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button
              type="button"
              className="w-full"
              onClick={onUnlock}
              disabled={loading || !passcode.trim()}
            >
              {loading ? "Checking..." : "Unlock register"}
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href={backHref}>Back to overview</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}
