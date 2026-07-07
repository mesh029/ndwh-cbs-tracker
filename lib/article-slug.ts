export function slugifyArticleTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}

export function getArticleSlug(article: { id: string; title: string }): string {
  const base = slugifyArticleTitle(article.title)
  const safeBase = base || "article"
  return `${safeBase}-${article.id.slice(0, 8)}`
}
