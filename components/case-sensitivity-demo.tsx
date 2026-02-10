"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle } from "lucide-react"
import { facilitiesMatch } from "@/lib/utils"

/**
 * Component to demonstrate case-insensitive matching
 */
export function CaseSensitivityDemo() {
  const testCases = [
    {
      name1: "Kakamega County Referral Hospital",
      name2: "KAKAMEGA COUNTY REFERRAL HOSPITAL",
      shouldMatch: true,
    },
    {
      name1: "St. Mary's Hospital Mumias",
      name2: "st. mary's hospital mumias",
      shouldMatch: true,
    },
    {
      name1: "Vihiga County Referral Hospital",
      name2: "Vihiga County Referral Hospital",
      shouldMatch: true,
    },
    {
      name1: "Kisumu County Hospital",
      name2: "Kisumu General Hospital",
      shouldMatch: false,
    },
    {
      name1: "Nyamira County Referral Hospital",
      name2: "Nyamira County Referral Hospital  ",
      shouldMatch: true,
    },
    {
      name1: "Ahero Sub-County Hospital",
      name2: "ahero sub-county hospital",
      shouldMatch: true,
    },
  ]

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          Case-Insensitive Matching Test
        </CardTitle>
        <CardDescription>
          The system matches facilities regardless of case differences. Test examples:
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {testCases.map((test, index) => {
            const matches = facilitiesMatch(test.name1, test.name2)
            const isCorrect = matches === test.shouldMatch

            return (
              <div
                key={index}
                className={`rounded-md border p-3 transition-colors ${
                  isCorrect
                    ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                    : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-1">
                    <div className="text-sm">
                      <span className="font-medium">Name 1:</span>{" "}
                      <code className="text-xs bg-background px-1 py-0.5 rounded">
                        {test.name1}
                      </code>
                    </div>
                    <div className="text-sm">
                      <span className="font-medium">Name 2:</span>{" "}
                      <code className="text-xs bg-background px-1 py-0.5 rounded">
                        {test.name2}
                      </code>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Expected: {test.shouldMatch ? "Match" : "No Match"} | Actual:{" "}
                      {matches ? "Match" : "No Match"}
                    </div>
                  </div>
                  <div className="ml-4">
                    {isCorrect ? (
                      <Badge variant="success" className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Correct
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <XCircle className="h-3 w-3" />
                        Error
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-4 p-3 bg-primary/10 rounded-md">
          <p className="text-sm text-muted-foreground">
            <strong>How it works:</strong> All facility names are normalized (trimmed,
            lowercased, extra spaces removed) before comparison. This means{" "}
            <code>&quot;KAKAMEGA HOSPITAL&quot;</code> will match{" "}
            <code>&quot;kakamega hospital&quot;</code> and{" "}
            <code>&quot;Kakamega Hospital&quot;</code>.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
