import Link from "next/link"
import Image from "next/image"
import { cookies } from "next/headers"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { APP_VERSION } from "@/lib/version"
import { ThemeToggle } from "@/components/theme-toggle"
import { HomeGuidedTour } from "@/components/home-guided-tour"
import { HomeAuthButton } from "@/components/home-auth-button"
import { getArticles, getArticleSlug } from "@/lib/articles"
import { HomeDistributionMap } from "@/components/home-distribution-map"
import { prisma } from "@/lib/prisma"
import { ArrowRight, FileText, Home as HomeIcon, Monitor, Newspaper, Package, ShieldCheck, Ticket } from "lucide-react"
import { AUTH_ACCESS_COOKIE, AUTH_COOKIE_NAME, AUTH_USERNAME_COOKIE, isValidRole, parseAccessCookie } from "@/lib/auth"

const COUNTY_CENTERS = [
  { location: "Kakamega", latitude: 0.2827, longitude: 34.7519 },
  { location: "Vihiga", latitude: 0.0760, longitude: 34.7229 },
  { location: "Nyamira", latitude: -0.5669, longitude: 34.9341 },
  { location: "Kisumu", latitude: -0.1022, longitude: 34.7617 },
] as const

export default async function Home() {
  const cookieStore = await cookies()
  const roleCookie = cookieStore.get(AUTH_COOKIE_NAME)?.value
  const username = cookieStore.get(AUTH_USERNAME_COOKIE)?.value
  const access = parseAccessCookie(cookieStore.get(AUTH_ACCESS_COOKIE)?.value)
  const isLoggedIn = isValidRole(roleCookie)
  const firstScopedLocation = access?.locations === "all" ? null : access?.locations?.[0] || null
  const canSeeTickets = !isLoggedIn || !!access?.modules?.includes("tickets")
  const canSeeAssets = !isLoggedIn || !!access?.modules?.includes("assets")
  const canSeeDashboard = !isLoggedIn || !!access?.modules?.includes("dashboard")
  const canSeeReports = !isLoggedIn || !!access?.modules?.includes("reports")
  const articles = await getArticles()
  const publishedArticles = articles
    .filter((article) => article.status === "published")
    .sort((a, b) => new Date(b.publishedAt || b.updatedAt).getTime() - new Date(a.publishedAt || a.updatedAt).getTime())
    .slice(0, 3)
  const heroArticle = publishedArticles[0]
  const heroImage = heroArticle?.imageUrl || "https://images.unsplash.com/photo-1516574187841-cb9cc2ca948b?auto=format&fit=crop&w=2200&q=80"
  const ticketHref = firstScopedLocation ? `/tickets?location=${encodeURIComponent(firstScopedLocation)}` : "/tickets"
  const dashboardHref = firstScopedLocation ? `/nyamira?location=${encodeURIComponent(firstScopedLocation)}` : "/nyamira"
  const [serverByLocation, ticketByLocation] = await Promise.all([
    prisma.serverAsset.groupBy({
      by: ["location"],
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({
      by: ["location"],
      _count: { _all: true },
    }),
  ])
  const [facilityServerByLocation, facilityServerBySubcounty] = await Promise.all([
    prisma.facility.groupBy({
      by: ["location"],
      where: { isMaster: true, serverType: { not: null } },
      _count: { _all: true },
    }),
    prisma.facility.groupBy({
      by: ["location", "subcounty"],
      where: { isMaster: true, serverType: { not: null }, subcounty: { not: null } },
      _count: { _all: true },
    }),
  ])
  const [serverBySubcounty, ticketBySubcounty] = await Promise.all([
    prisma.serverAsset.groupBy({
      by: ["location", "subcounty"],
      where: { subcounty: { not: null } },
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({
      by: ["location", "subcounty"],
      where: { subcounty: { not: "" } },
      _count: { _all: true },
    }),
  ])
  const serverCountMap = new Map(serverByLocation.map((row) => [row.location, row._count._all]))
  const facilityServerCountMap = new Map(facilityServerByLocation.map((row) => [row.location, row._count._all]))
  const ticketCountMap = new Map(ticketByLocation.map((row) => [row.location, row._count._all]))
  const mapMetrics = COUNTY_CENTERS.map((county) => ({
    ...county,
    // Prefer the broader server signal during transition (assets table + facility inventory table)
    serverCount: Math.max(serverCountMap.get(county.location) || 0, facilityServerCountMap.get(county.location) || 0),
    ticketCount: ticketCountMap.get(county.location) || 0,
  }))
  const subcountyKey = (location: string, subcounty: string) => `${location.toLowerCase()}::${subcounty.toLowerCase()}`
  const mergedSubcounty = new Map<string, { location: string; subcounty: string; serverCount: number; ticketCount: number }>()
  for (const row of serverBySubcounty) {
    const subcounty = String(row.subcounty || "").trim()
    if (!subcounty) continue
    const key = subcountyKey(row.location, subcounty)
    mergedSubcounty.set(key, {
      location: row.location,
      subcounty,
      serverCount: row._count._all,
      ticketCount: mergedSubcounty.get(key)?.ticketCount || 0,
    })
  }
  for (const row of facilityServerBySubcounty) {
    const subcounty = String(row.subcounty || "").trim()
    if (!subcounty) continue
    const key = subcountyKey(row.location, subcounty)
    const existing = mergedSubcounty.get(key)
    mergedSubcounty.set(key, {
      location: row.location,
      subcounty,
      serverCount: Math.max(existing?.serverCount || 0, row._count._all),
      ticketCount: existing?.ticketCount || 0,
    })
  }
  for (const row of ticketBySubcounty) {
    const subcounty = String(row.subcounty || "").trim()
    if (!subcounty) continue
    const key = subcountyKey(row.location, subcounty)
    const existing = mergedSubcounty.get(key)
    mergedSubcounty.set(key, {
      location: row.location,
      subcounty,
      serverCount: existing?.serverCount || 0,
      ticketCount: row._count._all,
    })
  }
  const subcountyMetrics = Array.from(mergedSubcounty.values())

  return (
    <main className="min-h-screen bg-background">
      <section className="relative min-h-[92vh] overflow-hidden">
        <Image
          src={heroImage}
          alt="HIS hero background"
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/40 dark:bg-black/55" />
        <div className="absolute inset-0 bg-white/15 dark:bg-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/60 via-slate-900/25 to-slate-900/55 dark:from-black/80 dark:via-black/35 dark:to-black/70" />

        <div className="relative mx-auto w-full max-w-[1800px] h-[92vh] px-3 sm:px-4 lg:px-6">
          <div className="grid h-full grid-cols-1 lg:grid-cols-[70px_1fr]">
            <aside id="home-sidebar-nav" className="flex lg:flex-col flex-row justify-between items-center py-2 lg:py-8 px-2 lg:px-0 border-b lg:border-b-0 lg:border-r border-white/15">
              <div className="flex lg:flex-col flex-row items-center gap-3 lg:gap-5 text-white/90">
                <Link href="/" className="block rounded-md p-2 hover:bg-white/15" aria-label="Home" title="Home">
                  <HomeIcon className="h-4 w-4" />
                </Link>
                {canSeeTickets && (
                  <Link href={ticketHref} className="block rounded-md p-2 hover:bg-white/15" aria-label="Tickets" title="Tickets">
                    <Ticket className="h-4 w-4" />
                  </Link>
                )}
                {canSeeAssets && (
                  <Link href="/asset-manager" className="block rounded-md p-2 hover:bg-white/15" aria-label="Assets" title="Assets">
                    <Package className="h-4 w-4" />
                  </Link>
                )}
                {canSeeDashboard && (
                  <Link href={dashboardHref} className="block rounded-md p-2 hover:bg-white/15" aria-label="Dashboard" title="Dashboard">
                    <Monitor className="h-4 w-4" />
                  </Link>
                )}
                {canSeeReports && (
                  <Link href="/reports" className="block rounded-md p-2 hover:bg-white/15" aria-label="Reports" title="Reports">
                    <FileText className="h-4 w-4" />
                  </Link>
                )}
                <Link href="/articles" className="block rounded-md p-2 hover:bg-white/15" aria-label="Articles" title="Articles">
                  <Newspaper className="h-4 w-4" />
                </Link>
              </div>
              <Badge variant="outline" className="border-white/30 text-white text-[10px]">v{APP_VERSION}</Badge>
            </aside>

            <div className="flex flex-col">
              <div className="flex items-center justify-between h-16 border-b border-white/15 text-white">
                <div className="flex items-center gap-2">
                  <Badge className="bg-white/15 text-white border-white/30">PATH HIS</Badge>
                  <span className="hidden sm:inline text-sm tracking-[0.2em] text-white/80">EMR + ASSETS</span>
                </div>
                <div className="hidden md:block text-xs tracking-[0.3em] uppercase text-white/75">HIS Command Portal</div>
                <div className="flex items-center gap-2">
                  <HomeGuidedTour />
                  <ThemeToggle className="border-white/50 bg-white/85 text-slate-900 hover:bg-white dark:bg-black/40 dark:text-white dark:border-white/40 dark:hover:bg-black/55" />
                  <HomeAuthButton />
                </div>
              </div>

              <div className="flex-1 grid items-end pb-8 sm:pb-10">
                <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-5 text-white">
                    <p className="text-xs sm:text-sm tracking-[0.35em] text-white/80 uppercase">Care Systems Command</p>
                    <h1 className="text-5xl sm:text-7xl lg:text-8xl font-bold leading-[0.92] tracking-tight">
                      HIS<br />OPERATIONS
                    </h1>
                    <p className="max-w-2xl text-white/85 text-sm sm:text-base">
                      Unified command for EMR support, ticket triage, infrastructure tracking, and county performance visibility.
                    </p>
                    {isLoggedIn && (
                      <p className="text-sm text-emerald-300">
                        Signed in{username ? ` as ${username}` : ""}. Access is scoped to your assigned modules and locations.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button asChild>
                        <Link href="/articles">Read Latest Briefs <ArrowRight className="ml-2 h-4 w-4" /></Link>
                      </Button>
                      {canSeeAssets && (
                        <Button asChild variant="outline" className="bg-transparent border-white/40 text-white hover:bg-white/10">
                          <Link href="/asset-manager">Open Asset Center</Link>
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 self-end">
                    <Card id="home-featured-article" className="bg-black/45 border-white/15 text-white backdrop-blur">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{heroArticle?.title || "Operational Focus"}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm text-white/80 line-clamp-3">
                          {heroArticle?.summary || "Browse the latest troubleshooting and field support updates from HIS teams."}
                        </p>
                        <p className="text-xs text-white/70">By {heroArticle?.authorName || "HIS Editorial"}</p>
                        {heroArticle && (
                          <Button size="sm" variant="secondary" asChild>
                            <Link href={`/articles/${getArticleSlug(heroArticle)}`}>Open featured article</Link>
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                    <div className="grid grid-cols-2 gap-3">
                      <Card className="bg-black/45 border-white/15 text-white">
                        <CardContent className="pt-4">
                          <p className="text-xs text-white/70">Module</p>
                          <p className="font-semibold">Tickets + Assets</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-black/45 border-white/15 text-white">
                        <CardContent className="pt-4">
                          <p className="text-xs text-white/70">Security</p>
                          <p className="font-semibold flex items-center gap-1"><ShieldCheck className="h-4 w-4" /> Scoped RBAC</p>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="home-map-section" className="mx-auto w-full max-w-[1800px] px-3 sm:px-4 lg:px-6 py-8 sm:py-10">
        <div className="mb-8">
          <HomeDistributionMap metrics={mapMetrics} subcountyMetrics={subcountyMetrics} />
        </div>
        <div id="home-articles-section" className="flex items-center justify-between mb-4">
          <h2 className="text-xl sm:text-2xl font-semibold">Latest Article Previews</h2>
          <Button variant="ghost" asChild><Link href="/articles">View all</Link></Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {publishedArticles.map((article) => (
            <Card key={article.id} className="overflow-hidden">
              {article.imageUrl && (
                <Image src={article.imageUrl} alt={article.title} width={900} height={420} className="h-44 w-full object-cover" />
              )}
              <CardHeader className="pb-2">
                <CardTitle className="text-base line-clamp-2">{article.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground line-clamp-3">{article.summary}</p>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/articles/${getArticleSlug(article)}`}>Read article <ArrowRight className="ml-2 h-3.5 w-3.5" /></Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <footer className="border-t bg-muted/30">
        <div className="mx-auto w-full max-w-[1800px] px-3 sm:px-4 lg:px-6 py-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">PATH EMR & Assets</p>
            <p className="text-xs text-muted-foreground">County digital support, ticketing, and infrastructure visibility.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Version {APP_VERSION}</Badge>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/articles">Knowledge Base</Link>
            </Button>
          </div>
        </div>
      </footer>
    </main>
  )
}
