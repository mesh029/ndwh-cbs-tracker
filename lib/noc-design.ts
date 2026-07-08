/** Shared NOC / enterprise dashboard surface tokens (Tailwind class strings). */
export const noc = {
  canvas: "min-h-full bg-muted/30 dark:bg-[#0B0B0D]",
  page: "w-full space-y-6",
  hero:
    "rounded-3xl border border-border/40 dark:border-white/10 bg-card dark:bg-[#111214] p-5 md:p-6 shadow-sm dark:shadow-[0_22px_70px_rgba(0,0,0,0.45)]",
  panel:
    "rounded-2xl border border-border/40 dark:border-white/10 bg-card dark:bg-[#111214] p-4 md:p-5 shadow-sm",
  panelInset:
    "rounded-xl border border-border/35 dark:border-white/10 bg-muted/30 dark:bg-[#0F1012] p-3 md:p-4",
  kpi:
    "rounded-2xl border border-border/40 dark:border-white/10 bg-card dark:bg-[#111214] p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-[0_16px_36px_rgba(0,0,0,0.32)]",
  action:
    "rounded-xl border border-border/40 dark:border-white/10 bg-card dark:bg-[#0F1012] p-3 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-500/40 hover:shadow-md dark:hover:shadow-[0_12px_30px_rgba(59,130,246,0.12)]",
  eyebrow: "text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground dark:text-slate-400",
  title: "text-3xl md:text-4xl font-semibold tracking-tight text-foreground dark:text-slate-100",
  sectionTitle: "text-xl font-semibold tracking-tight text-foreground dark:text-slate-100",
  body: "text-sm text-muted-foreground dark:text-slate-400",
  metric: "text-3xl md:text-4xl font-semibold tracking-tight tabular-nums text-foreground dark:text-slate-100",
  progressTrack: "h-1.5 overflow-hidden rounded-full bg-muted dark:bg-white/10",
  progressBar: "h-full rounded-full bg-blue-500 transition-all duration-700",
} as const
