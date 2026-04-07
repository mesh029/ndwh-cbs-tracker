import { prisma } from "@/lib/prisma"

export const ARTICLES_SETTING_KEY = "his_articles_v1"
const DEFAULT_ARTICLE_AUTHOR = "Meshack Ariri"

export type ArticleStatus = "draft" | "published"

export interface Article {
  id: string
  title: string
  summary: string
  bodyMarkdown: string
  imageUrl: string | null
  authorName: string
  tags: string[]
  status: ArticleStatus
  createdAt: string
  updatedAt: string
  publishedAt: string | null
}

export function slugifyArticleTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}

export function getArticleSlug(article: Article): string {
  const base = slugifyArticleTitle(article.title)
  const safeBase = base || "article"
  return `${safeBase}-${article.id.slice(0, 8)}`
}

const SAMPLE_ARTICLES: Article[] = [
  {
    id: "sample-cybersecurity-his-ops",
    title: "Cybersecurity in HIS: Practical Defenses for EMR Operations",
    summary: "Baseline security practices for HIS teams to protect EMR systems, user accounts, and county infrastructure.",
    bodyMarkdown: `## Why This Matters
EMR uptime and patient data integrity depend on strong daily security practices.

## Priority Controls
1. Enforce strong passwords and role-based access per user
2. Use least-privilege access for modules and locations
3. Keep operating systems, browsers, and endpoint protection updated
4. Review asset inventories and unknown devices weekly

## HIS Team Checklist
- Disable inactive user accounts immediately
- Escalate suspicious login activity and unexpected API failures
- Verify backup/restore readiness monthly
- Document incidents and post mitigation notes in the knowledge base

## Outcome
Consistent security routines reduce service disruption risk and improve trust in EMR systems across facilities.
`,
    imageUrl: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1400&q=80",
    authorName: DEFAULT_ARTICLE_AUTHOR,
    tags: ["cybersecurity", "his", "emr", "governance"],
    status: "published",
    createdAt: "2026-04-07T09:00:00.000Z",
    updatedAt: "2026-04-07T09:00:00.000Z",
    publishedAt: "2026-04-07T09:00:00.000Z",
  },
  {
    id: "sample-troubleshooting-network-latency",
    title: "Reducing EMR Sync Delays in Rural Sites",
    summary: "A practical troubleshooting sequence for frequent slow sync complaints in low-bandwidth facilities.",
    bodyMarkdown: `## Context
Some facilities were reporting delayed EMR sync during peak hours.

## What We Checked
1. Signal strength and SIM provider stability
2. Router uptime and restart frequency
3. Local LAN bottlenecks between server and client machines

## What Worked
- Scheduled off-peak background sync windows
- Replaced unstable SIM cards in high-loss areas
- Updated router configuration to prioritize EMR traffic

## Outcome
Average sync delay reduced from **15-20 minutes** to **under 5 minutes** in the affected facilities.
`,
    imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1400&q=80",
    authorName: DEFAULT_ARTICLE_AUTHOR,
    tags: ["troubleshooting", "network", "emr"],
    status: "published",
    createdAt: "2026-04-01T08:00:00.000Z",
    updatedAt: "2026-04-01T08:00:00.000Z",
    publishedAt: "2026-04-01T08:00:00.000Z",
  },
  {
    id: "sample-team-strides-q1",
    title: "Q1 Team Strides: EMR Stability and Asset Visibility",
    summary: "Highlights of what the HIS team improved in uptime, ticket turnaround, and asset tracking.",
    bodyMarkdown: `## Highlights
- Introduced structured EMR ticket categories for quicker triage
- Improved assignment workflows for faster ownership
- Expanded visibility of server/router/simcard inventory

## Why It Matters
These changes reduce downtime and make issue resolution more predictable for facility teams.

## Next Focus
1. Publish troubleshooting guides weekly
2. Standardize asset editing in row/column workflows
3. Expand progress reporting per county
`,
    imageUrl: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=1400&q=80",
    authorName: DEFAULT_ARTICLE_AUTHOR,
    tags: ["team-strides", "operations", "progress"],
    status: "published",
    createdAt: "2026-04-02T10:00:00.000Z",
    updatedAt: "2026-04-02T10:00:00.000Z",
    publishedAt: "2026-04-02T10:00:00.000Z",
  },
]

function normalizeArticle(input: Partial<Article>): Article {
  const now = new Date().toISOString()
  const status: ArticleStatus = input.status === "draft" ? "draft" : "published"
  const publishedAt = status === "published" ? (input.publishedAt ?? now) : null

  return {
    id: input.id || crypto.randomUUID(),
    title: (input.title || "").trim(),
    summary: (input.summary || "").trim(),
    bodyMarkdown: (input.bodyMarkdown || "").trim(),
    imageUrl: input.imageUrl?.trim() || null,
    authorName: DEFAULT_ARTICLE_AUTHOR,
    tags: Array.isArray(input.tags)
      ? input.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : [],
    status,
    createdAt: input.createdAt || now,
    updatedAt: now,
    publishedAt,
  }
}

export async function getArticles(): Promise<Article[]> {
  const setting = await prisma.appSetting.findUnique({ where: { key: ARTICLES_SETTING_KEY } })
  if (!setting?.value) {
    return SAMPLE_ARTICLES
  }

  try {
    const parsed = JSON.parse(setting.value)
    if (!Array.isArray(parsed)) return SAMPLE_ARTICLES
    const normalized = parsed.map((article) => normalizeArticle(article))
    const existingIds = new Set(normalized.map((article) => article.id))
    const merged = [
      ...normalized,
      ...SAMPLE_ARTICLES.filter((article) => !existingIds.has(article.id)).map((article) => normalizeArticle(article)),
    ]
    return merged.sort((a, b) => {
      const aTime = new Date(a.publishedAt || a.updatedAt).getTime()
      const bTime = new Date(b.publishedAt || b.updatedAt).getTime()
      return bTime - aTime
    })
  } catch {
    return SAMPLE_ARTICLES
  }
}

export async function saveArticles(articles: Article[]): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: ARTICLES_SETTING_KEY },
    create: { key: ARTICLES_SETTING_KEY, value: JSON.stringify(articles) },
    update: { value: JSON.stringify(articles) },
  })
}

export async function createArticle(input: Partial<Article>): Promise<Article> {
  const article = normalizeArticle(input)
  const articles = await getArticles()
  const next = [article, ...articles].sort((a, b) => {
    const aTime = new Date(a.publishedAt || a.updatedAt).getTime()
    const bTime = new Date(b.publishedAt || b.updatedAt).getTime()
    return bTime - aTime
  })
  await saveArticles(next)
  return article
}

export async function updateArticle(id: string, input: Partial<Article>): Promise<Article | null> {
  const articles = await getArticles()
  const existing = articles.find((item) => item.id === id)
  if (!existing) return null

  const merged = normalizeArticle({
    ...existing,
    ...input,
    id: existing.id,
    createdAt: existing.createdAt,
  })

  const next = articles.map((item) => (item.id === id ? merged : item)).sort((a, b) => {
    const aTime = new Date(a.publishedAt || a.updatedAt).getTime()
    const bTime = new Date(b.publishedAt || b.updatedAt).getTime()
    return bTime - aTime
  })

  await saveArticles(next)
  return merged
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const articles = await getArticles()
  const exact = articles.find((article) => getArticleSlug(article) === slug)
  if (exact) return exact

  const maybeId = slug.split("-").slice(-1)[0]
  const byIdPrefix = articles.find((article) => article.id.startsWith(maybeId))
  return byIdPrefix || null
}

