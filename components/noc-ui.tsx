import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { noc } from "@/lib/noc-design"

export function NocPage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("noc-surface", noc.page, className)}>{children}</div>
}

export function NocHero({
  eyebrow,
  title,
  description,
  meta,
  actions,
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <section className={cn(noc.hero, className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          {eyebrow ? <p className={noc.eyebrow}>{eyebrow}</p> : null}
          <h1 className={noc.title}>{title}</h1>
          {description ? <p className={cn(noc.body, "max-w-3xl")}>{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {meta ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{meta}</div> : null}
    </section>
  )
}

export function NocMetaTile({ label, value, icon: Icon }: { label: string; value: ReactNode; icon?: LucideIcon }) {
  return (
    <div className={noc.panelInset}>
      <p className="text-[13px] text-muted-foreground dark:text-slate-400">{label}</p>
      <p className="mt-2 flex items-center gap-2 text-sm font-medium text-foreground dark:text-slate-100">
        {Icon ? <Icon className="h-4 w-4 text-muted-foreground dark:text-slate-300" /> : null}
        {value}
      </p>
    </div>
  )
}

export function NocSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn(noc.panel, className)}>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className={noc.sectionTitle}>{title}</h2>
          {description ? <p className={cn(noc.body, "mt-1")}>{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function NocKpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  progress,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
  tone?: "default" | "success" | "warning" | "danger" | "info"
  progress?: number
}) {
  const toneClass = {
    default: "text-blue-500",
    success: "text-emerald-500",
    warning: "text-amber-500",
    danger: "text-red-500",
    info: "text-sky-500",
  }[tone]

  return (
    <div className={noc.kpi}>
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground dark:text-slate-400">{label}</p>
        {Icon ? <Icon className={cn("h-4 w-4", toneClass)} /> : null}
      </div>
      <p className={cn("mt-3", noc.metric)}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground dark:text-slate-400">{hint}</p> : null}
      {typeof progress === "number" ? (
        <div className={cn("mt-3", noc.progressTrack)}>
          <div className={noc.progressBar} style={{ width: `${Math.max(4, Math.min(100, progress))}%` }} />
        </div>
      ) : null}
    </div>
  )
}

export function NocActionCard({
  label,
  description,
  icon: Icon,
  onClick,
  tone = "default",
}: {
  label: string
  description?: string
  icon: LucideIcon
  onClick?: () => void
  tone?: "default" | "danger" | "success" | "warning"
}) {
  const toneClass = {
    default: "text-blue-500",
    danger: "text-red-500",
    success: "text-emerald-500",
    warning: "text-amber-500",
  }[tone]

  return (
    <button type="button" onClick={onClick} className={cn(noc.action, "w-full")}>
      <div className="flex items-start gap-3">
        <div className="rounded-lg border border-border/40 dark:border-white/10 bg-muted/40 dark:bg-white/5 p-2">
          <Icon className={cn("h-4 w-4", toneClass)} />
        </div>
        <div className="min-w-0 text-left">
          <p className="text-sm font-medium text-foreground dark:text-slate-100">{label}</p>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground dark:text-slate-400">{description}</p> : null}
        </div>
      </div>
    </button>
  )
}
