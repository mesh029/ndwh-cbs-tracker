"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Plus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  MapPin,
  AlertCircle,
  User,
  Send,
  X,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { cn, facilitiesMatch } from "@/lib/utils"
import { FilterChip } from "@/components/filter-chips"

const LOCATIONS = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"] as const
type Location = (typeof LOCATIONS)[number]

const ISSUE_CHIPS = ["Server", "Network", "Power", "Simcard", "Storage/SSD", "Connectivity", "Other"] as const
type IssueChip = (typeof ISSUE_CHIPS)[number]
const NETWORK_CHIPS: IssueChip[] = ["Network", "Simcard", "Connectivity"]

const REPORTER_ROLES = [
  "HRIO", "HMIS", "M&E Associate", "Peer Educator", "Facility In-charge", "Other",
] as const

const STEPS = [
  { id: "where", label: "Location", icon: MapPin },
  { id: "what", label: "Issue", icon: AlertCircle },
  { id: "who", label: "You", icon: User },
  { id: "assign", label: "Assign", icon: Send },
  { id: "review", label: "Review", icon: CheckCircle2 },
] as const

export interface SubmittedTicket {
  id: string
  facilityName: string
  location: string
  subcounty: string
  assignedTo: string | null
  serverCondition: string
  problem: string
  reportedBy: string | null
  createdAt: string
}

interface GuestTicketWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assigneeChips: string[]
  defaultLocation?: string
  onSubmitted: (ticket: SubmittedTicket) => void
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return isMobile
}

const chipClass = (selected: boolean, color: "indigo" | "orange" | "violet") =>
  cn(
    "px-4 py-2.5 rounded-full text-sm font-medium transition-all border touch-manipulation min-h-[44px]",
    selected
      ? color === "indigo"
        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
        : color === "orange"
          ? "bg-orange-500 text-white border-orange-500 shadow-sm"
          : "bg-violet-600 text-white border-violet-600 shadow-sm"
      : "bg-background text-muted-foreground border-border hover:border-primary/50"
  )

export function GuestTicketWizard({
  open,
  onOpenChange,
  assigneeChips,
  defaultLocation = "Nyamira",
  onSubmitted,
}: GuestTicketWizardProps) {
  const { toast } = useToast()
  const isMobile = useIsMobile()

  const [step, setStep] = useState(0)
  const [phase, setPhase] = useState<"wizard" | "success">("wizard")
  const [isSaving, setIsSaving] = useState(false)
  const [submittedTicket, setSubmittedTicket] = useState<SubmittedTicket | null>(null)

  const [facilityName, setFacilityName] = useState("")
  const [facilityQuery, setFacilityQuery] = useState("")
  const [showFacilityList, setShowFacilityList] = useState(false)
  const [selectedChips, setSelectedChips] = useState<string[]>([])
  const [serverCondition, setServerCondition] = useState("")
  const [problem, setProblem] = useState("")
  const [reportedBy, setReportedBy] = useState("")
  const [reporterRole, setReporterRole] = useState("")
  const [reporterDetails, setReporterDetails] = useState("")
  const [location, setLocation] = useState(defaultLocation)
  const [subcounty, setSubcounty] = useState("")
  const [subcountyAutoDetected, setSubcountyAutoDetected] = useState(false)
  const [subcounties, setSubcounties] = useState<string[]>([])
  const [facilities, setFacilities] = useState<Array<{ name: string; subcounty: string | null }>>([])
  const [isLoadingLocationData, setIsLoadingLocationData] = useState(false)
  const [issueType, setIssueType] = useState<"server" | "network">("server")
  const [assignedTo, setAssignedTo] = useState("")

  const progress = phase === "success" ? 100 : ((step + 1) / STEPS.length) * 100

  const filteredFacilities = useMemo(() => {
    const q = facilityQuery.trim().toLowerCase()
    if (!q) return facilities.slice(0, 12)
    return facilities.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 12)
  }, [facilities, facilityQuery])

  const loadLocationData = useCallback(async (loc: string) => {
    setIsLoadingLocationData(true)
    try {
      const res = await fetch(`/api/facilities?system=NDWH&location=${loc}&isMaster=true`)
      const data = await res.json()
      const list = (data.facilities || []).map((f: { name: string; subcounty?: string | null }) => ({
        name: f.name,
        subcounty: f.subcounty || null,
      }))
      setFacilities(list)
      const unique = Array.from(
        new Set(
          list
            .map((f: { subcounty: string | null }) => f.subcounty)
            .filter((sc: string | null): sc is string => !!sc?.trim())
        )
      ).sort() as string[]
      setSubcounties(unique)
      if (unique.length === 1) {
        setSubcounty(unique[0] as string)
        setSubcountyAutoDetected(true)
      }
    } catch {
      setFacilities([])
      setSubcounties([])
    } finally {
      setIsLoadingLocationData(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void loadLocationData(location)
  }, [open, location, loadLocationData])

  const resetAll = () => {
    setStep(0)
    setPhase("wizard")
    setSubmittedTicket(null)
    setFacilityName("")
    setFacilityQuery("")
    setShowFacilityList(false)
    setSelectedChips([])
    setServerCondition("")
    setProblem("")
    setReportedBy("")
    setReporterRole("")
    setReporterDetails("")
    setSubcounty("")
    setSubcountyAutoDetected(false)
    setIssueType("server")
    setAssignedTo("")
    setIsSaving(false)
  }

  const handleClose = () => {
    resetAll()
    onOpenChange(false)
  }

  const selectFacility = (name: string, sc: string | null) => {
    setFacilityName(name)
    setFacilityQuery(name)
    setShowFacilityList(false)
    if (sc) {
      setSubcounty(sc)
      setSubcountyAutoDetected(true)
    } else {
      setSubcountyAutoDetected(false)
    }
  }

  const handleFacilityInput = (value: string) => {
    setFacilityQuery(value)
    setFacilityName(value)
    setShowFacilityList(true)
    if (!value.trim()) {
      setSubcountyAutoDetected(false)
      setSubcounty("")
      return
    }
    const matched = facilities.find((f) => facilitiesMatch(f.name, value.trim()))
    if (matched?.subcounty) {
      setSubcounty(matched.subcounty)
      setSubcountyAutoDetected(true)
    } else {
      setSubcountyAutoDetected(false)
    }
  }

  const toggleChip = (chip: string) => {
    const next = selectedChips.includes(chip)
      ? selectedChips.filter((c) => c !== chip)
      : [...selectedChips, chip]
    setSelectedChips(next)
    setServerCondition(next.join(", "))
    const hasNetwork = next.some((c) => NETWORK_CHIPS.includes(c as IssueChip))
    const hasServerOnly = next.some((c) => !NETWORK_CHIPS.includes(c as IssueChip))
    setIssueType(hasNetwork && !hasServerOnly ? "network" : "server")
  }

  const validateStep = (index: number): string | null => {
    if (index === 0) {
      if (!location) return "Select a county"
      if (!subcounty.trim()) return "Subcounty is required"
      if (!facilityName.trim()) return "Facility name is required"
    }
    if (index === 1) {
      if (selectedChips.length === 0) return "Select at least one issue category"
      if (!problem.trim()) return "Describe the problem"
    }
    if (index === 2) {
      if (!reportedBy.trim()) return "Your name is required"
    }
    if (index === 3) {
      if (!assignedTo.trim()) return "Select who should handle this ticket"
    }
    return null
  }

  const goNext = () => {
    const err = validateStep(step)
    if (err) {
      toast({ title: "Almost there", description: err, variant: "destructive" })
      return
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  const goBack = () => setStep((s) => Math.max(s - 1, 0))

  const handleSubmit = async () => {
    if (isSaving) return
    for (let i = 0; i < STEPS.length - 1; i++) {
      const err = validateStep(i)
      if (err) {
        toast({ title: "Missing information", description: err, variant: "destructive" })
        setStep(i)
        return
      }
    }

    setIsSaving(true)
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facilityName: facilityName.trim(),
          serverCondition: serverCondition.trim(),
          problem: problem.trim(),
          reportedBy: reportedBy.trim(),
          reporterRole: reporterRole.trim() || null,
          reporterDetails: reporterDetails.trim() || null,
          assignedTo: assignedTo.trim(),
          location: location.trim(),
          subcounty: subcounty.trim(),
          status: "open",
          issueType,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Failed to submit ticket")

      const ticket = data.ticket as SubmittedTicket
      setSubmittedTicket(ticket)
      setPhase("success")
      onSubmitted(ticket)
    } catch (error) {
      toast({
        title: "Could not submit",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const stepContent = () => {
    if (phase === "success" && submittedTicket) {
      return (
        <div className="flex flex-col items-center justify-center flex-1 px-6 py-10 text-center gap-5">
          <div className="rounded-full bg-emerald-100 dark:bg-emerald-950 p-5">
            <CheckCircle2 className="h-14 w-14 text-emerald-600" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Ticket submitted!</h2>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto">
              Our team has been notified. You should hear back within 24–48 hours.
            </p>
          </div>
          <div className="w-full max-w-sm rounded-xl border bg-muted/30 p-4 text-left space-y-2 text-sm">
            <p><span className="text-muted-foreground">Facility:</span> <strong>{submittedTicket.facilityName}</strong></p>
            <p><span className="text-muted-foreground">County:</span> {submittedTicket.location} · {submittedTicket.subcounty}</p>
            <p><span className="text-muted-foreground">Assigned to:</span> {submittedTicket.assignedTo}</p>
            <p className="text-xs text-muted-foreground pt-1 border-t">
              Ref: {submittedTicket.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <Button size="lg" className="w-full max-w-sm h-12" onClick={handleClose}>
            Done
          </Button>
        </div>
      )
    }

    switch (step) {
      case 0:
        return (
          <div className="space-y-5">
            <div>
              <label className="text-sm font-medium mb-3 block">County</label>
              <div className="flex flex-wrap gap-2">
                {LOCATIONS.map((loc) => (
                  <FilterChip
                    key={loc}
                    label={loc}
                    selected={location === loc}
                    onClick={() => {
                      setLocation(loc)
                      setFacilityName("")
                      setFacilityQuery("")
                      setSubcounty("")
                      setSubcountyAutoDetected(false)
                    }}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Subcounty</label>
              {isLoadingLocationData ? (
                <Input disabled placeholder="Loading…" className="h-12" />
              ) : subcountyAutoDetected && subcounty ? (
                <div className="flex items-center gap-2 px-3 py-3 border rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <span className="text-sm font-medium flex-1">{subcounty}</span>
                  <button type="button" className="text-xs underline text-muted-foreground" onClick={() => setSubcountyAutoDetected(false)}>
                    Change
                  </button>
                </div>
              ) : subcounties.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {subcounties.map((sc) => (
                    <FilterChip
                      key={sc}
                      label={sc}
                      selected={subcounty === sc}
                      onClick={() => { setSubcounty(sc); setSubcountyAutoDetected(false) }}
                    />
                  ))}
                </div>
              ) : (
                <Input
                  value={subcounty}
                  onChange={(e) => setSubcounty(e.target.value)}
                  placeholder="Type subcounty"
                  className="h-12 text-base"
                />
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Facility</label>
              <Input
                value={facilityQuery}
                onChange={(e) => handleFacilityInput(e.target.value)}
                onFocus={() => setShowFacilityList(true)}
                placeholder="Search your facility…"
                className="h-12 text-base"
                autoComplete="off"
              />
              {showFacilityList && filteredFacilities.length > 0 && (
                <ul className="mt-2 border rounded-xl overflow-hidden divide-y max-h-48 overflow-y-auto bg-background shadow-sm">
                  {filteredFacilities.map((f) => (
                    <li key={f.name}>
                      <button
                        type="button"
                        className="w-full text-left px-4 py-3 text-sm hover:bg-muted active:bg-muted min-h-[44px]"
                        onClick={() => selectFacility(f.name, f.subcounty)}
                      >
                        {f.name}
                        {f.subcounty && <span className="text-xs text-muted-foreground block">{f.subcounty}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )
      case 1:
        return (
          <div className="space-y-5">
            <div>
              <label className="text-sm font-medium mb-3 block">What type of issue?</label>
              <div className="flex flex-wrap gap-2">
                {ISSUE_CHIPS.map((chip) => (
                  <button key={chip} type="button" onClick={() => toggleChip(chip)} className={chipClass(selectedChips.includes(chip), "indigo")}>
                    {chip}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Describe the problem</label>
              <Textarea
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                placeholder="What happened? When did it start? Is the EMR down?"
                rows={isMobile ? 5 : 4}
                className="text-base min-h-[120px]"
              />
            </div>
          </div>
        )
      case 2:
        return (
          <div className="space-y-5">
            <div>
              <label className="text-sm font-medium mb-2 block">Your name</label>
              <Input
                value={reportedBy}
                onChange={(e) => setReportedBy(e.target.value)}
                placeholder="Full name"
                className="h-12 text-base"
                autoComplete="name"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-3 block">Your role (optional)</label>
              <div className="flex flex-wrap gap-2">
                {REPORTER_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReporterRole(reporterRole === r ? "" : r)}
                    className={chipClass(reporterRole === r, "orange")}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Phone / notes (optional)</label>
              <Textarea
                value={reporterDetails}
                onChange={(e) => setReporterDetails(e.target.value)}
                placeholder="Phone number so we can reach you…"
                rows={2}
                className="text-base"
                inputMode="tel"
              />
            </div>
          </div>
        )
      case 3:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Who should handle this ticket first?</p>
            <div className="flex flex-wrap gap-2">
              {assigneeChips.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setAssignedTo(name)}
                  className={chipClass(assignedTo === name, "violet")}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )
      case 4:
        return (
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/20 p-4 space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-semibold">{facilityName}</p>
                  <p className="text-muted-foreground">{location} · {subcounty}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {selectedChips.map((c) => (
                  <span key={c} className="px-2 py-0.5 rounded-full text-xs bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">{c}</span>
                ))}
              </div>
              <p className="text-foreground/90 leading-relaxed">{problem}</p>
              <div className="pt-2 border-t space-y-1 text-xs text-muted-foreground">
                <p>Reported by: <span className="text-foreground font-medium">{reportedBy}</span>{reporterRole ? ` (${reporterRole})` : ""}</p>
                <p>Assigned to: <span className="text-foreground font-medium">{assignedTo}</span></p>
              </div>
            </div>
            <p className="text-xs text-center text-muted-foreground">
              Tap submit to notify the support team immediately.
            </p>
          </div>
        )
      default:
        return null
    }
  }

  const footer = phase === "success" ? null : (
    <div className="shrink-0 border-t bg-background px-4 py-4 flex gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
      {step > 0 ? (
        <Button variant="outline" className="flex-1 h-12" onClick={goBack}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      ) : (
        <Button variant="outline" className="flex-1 h-12" onClick={handleClose}>
          Cancel
        </Button>
      )}
      {step < STEPS.length - 1 ? (
        <Button className="flex-1 h-12 bg-blue-600 hover:bg-blue-700" onClick={goNext}>
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      ) : (
        <Button
          className="flex-1 h-12 bg-blue-600 hover:bg-blue-700"
          onClick={() => void handleSubmit()}
          disabled={isSaving}
        >
          {isSaving ? (
            <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Submitting…</>
          ) : (
            <><Send className="h-4 w-4 mr-2" />Submit ticket</>
          )}
        </Button>
      )}
    </div>
  )

  const header = (
    <div className="shrink-0 px-4 pt-4 pb-3 space-y-3">
      {phase === "wizard" && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Step {step + 1} of {STEPS.length}
              </p>
              <h2 className="text-lg font-bold">{STEPS[step].label}</h2>
            </div>
            {isMobile && (
              <button type="button" onClick={handleClose} className="p-2 -mr-2 text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
          <Progress value={progress} className="h-1.5" />
          <div className="flex gap-1 overflow-x-auto pb-1">
            {STEPS.map((s, i) => (
              <span
                key={s.id}
                className={cn(
                  "text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0",
                  i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground"
                )}
              >
                {s.label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )

  const body = (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-2 touch-pan-y">
      {stepContent()}
    </div>
  )

  if (isMobile) {
    if (!open) return null
    return (
      <div className="fixed inset-0 z-[60] bg-background flex flex-col">
        {header}
        {body}
        {footer}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v) }}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
        {phase === "wizard" && (
          <div className="px-6 pt-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-blue-600" />
                Log a ticket
              </DialogTitle>
              <DialogDescription>Step-by-step — our team is notified on submit.</DialogDescription>
            </DialogHeader>
          </div>
        )}
        {header}
        {body}
        {footer}
      </DialogContent>
    </Dialog>
  )
}
