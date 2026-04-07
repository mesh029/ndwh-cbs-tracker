import Link from "next/link"
import Image from "next/image"
import { notFound } from "next/navigation"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { APP_VERSION } from "@/lib/version"
import { getArticleBySlug } from "@/lib/articles"

export default async function ArticleDetailPage({
  params,
}: {
  params: { slug: string }
}) {
  const article = await getArticleBySlug(params.slug)
  if (!article) notFound()

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:py-10 space-y-5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">v{APP_VERSION}</Badge>
            <Badge className="text-xs bg-primary/10 text-primary border border-primary/20">Public Knowledge Base</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="text-sm text-primary hover:underline">Home</Link>
            <Link href="/articles" className="text-sm text-primary hover:underline">All Articles</Link>
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl sm:text-3xl">{article.title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              By {article.authorName} · {new Date(article.updatedAt).toLocaleDateString()}
            </p>
            <div className="flex gap-2 flex-wrap">
              <Badge variant={article.status === "published" ? "default" : "outline"} className="text-xs">
                {article.status}
              </Badge>
              {article.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">#{tag}</Badge>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {article.imageUrl && (
              <Image
                src={article.imageUrl}
                alt={article.title}
                width={1400}
                height={700}
                className="w-full max-h-[380px] object-cover rounded-md border"
              />
            )}
            <p className="text-muted-foreground">{article.summary}</p>
            <article className="markdown-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.bodyMarkdown}</ReactMarkdown>
            </article>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

