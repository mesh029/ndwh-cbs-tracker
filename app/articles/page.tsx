"use client"

import { useEffect, useMemo, useState } from "react"
import { useCallback } from "react"
import Image from "next/image"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Toaster } from "@/components/ui/toaster"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/components/ui/use-toast"
import { APP_VERSION } from "@/lib/version"
import { getArticleSlug } from "@/lib/articles"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BookOpen, Pencil, PlusCircle, LogIn } from "lucide-react"

type ArticleStatus = "draft" | "published"

interface Article {
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

const EMPTY_FORM = {
  title: "",
  summary: "",
  bodyMarkdown: "",
  imageUrl: "",
  authorName: "",
  tags: "",
  status: "published" as ArticleStatus,
}

export default function ArticlesPage() {
  const { role } = useAuth()
  const { toast } = useToast()
  const isAdmin = role === "admin" || role === "superadmin"

  const [articles, setArticles] = useState<Article[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeId, setActiveId] = useState<string>("")

  const [showEditor, setShowEditor] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const loadArticles = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/articles")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to load articles")
      const rows = (data.articles || []) as Article[]
      setArticles(rows)
      if (rows.length > 0 && !activeId) setActiveId(rows[0].id)
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load articles",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [activeId, toast])

  useEffect(() => {
    loadArticles()
  }, [loadArticles])

  const activeArticle = useMemo(
    () => articles.find((article) => article.id === activeId) || articles[0] || null,
    [articles, activeId]
  )

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowEditor(true)
  }

  const openEdit = (article: Article) => {
    setEditingId(article.id)
    setForm({
      title: article.title,
      summary: article.summary,
      bodyMarkdown: article.bodyMarkdown,
      imageUrl: article.imageUrl || "",
      authorName: article.authorName,
      tags: article.tags.join(", "),
      status: article.status,
    })
    setShowEditor(true)
  }

  const saveArticle = async () => {
    if (!form.title.trim() || !form.summary.trim() || !form.bodyMarkdown.trim() || !form.authorName.trim()) {
      toast({
        title: "Missing fields",
        description: "Title, summary, markdown content, and author are required.",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        summary: form.summary.trim(),
        bodyMarkdown: form.bodyMarkdown.trim(),
        imageUrl: form.imageUrl.trim() || null,
        authorName: form.authorName.trim(),
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        status: form.status,
      }

      const url = editingId ? `/api/articles/${editingId}` : "/api/articles"
      const method = editingId ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to save article")

      toast({ title: "Saved", description: editingId ? "Article updated." : "Article created." })
      setShowEditor(false)
      setForm(EMPTY_FORM)
      setEditingId(null)
      await loadArticles()
      if (data.article?.id) setActiveId(data.article.id)
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save article",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap border-b pb-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">v{APP_VERSION}</Badge>
            <Badge className="text-xs bg-primary/10 text-primary border border-primary/20">Public Articles</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/">Home</Link>
            </Button>
            {!role && (
              <Button asChild>
                <Link href="/login">
                  <LogIn className="mr-2 h-4 w-4" />
                  Login
                </Link>
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <BookOpen className="h-7 w-7 text-primary" />
                EMR Articles & Team Strides
              </h1>
              <p className="text-sm text-muted-foreground">
                Troubleshooting guides, progress updates, and operational notes in Markdown format.
              </p>
            </div>

            {isAdmin && (
              <Button onClick={openCreate}>
                <PlusCircle className="mr-2 h-4 w-4" />
                New Article
              </Button>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
            <Card className="h-fit">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Articles</CardTitle>
                <CardDescription>{articles.length} item(s)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading articles...</p>
                ) : articles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No articles yet.</p>
                ) : (
                  articles.map((article) => {
                    const active = activeArticle?.id === article.id
                    return (
                      <div key={article.id} className={`rounded-md border p-3 transition-colors ${active ? "border-primary bg-primary/5" : "hover:bg-accent"}`}>
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setActiveId(article.id)}
                        >
                          <p className="font-medium text-sm line-clamp-1">{article.title}</p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{article.summary}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant={article.status === "published" ? "default" : "outline"} className="text-[10px] px-1.5 py-0">
                              {article.status}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">{article.authorName}</span>
                          </div>
                        </button>
                        <div className="mt-2">
                          <Link href={`/articles/${getArticleSlug(article)}`} className="text-xs text-primary hover:underline">
                            Open public article page →
                          </Link>
                        </div>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle className="text-xl">{activeArticle?.title || "Select an article"}</CardTitle>
                    {activeArticle && (
                      <CardDescription>
                        By {activeArticle.authorName} · {new Date(activeArticle.updatedAt).toLocaleDateString()}
                      </CardDescription>
                    )}
                  </div>
                  {isAdmin && activeArticle && (
                    <Button variant="outline" size="sm" onClick={() => openEdit(activeArticle)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!activeArticle ? (
                  <p className="text-sm text-muted-foreground">No article selected.</p>
                ) : (
                  <div className="space-y-4">
                    {activeArticle.imageUrl && (
                      <Image
                        src={activeArticle.imageUrl}
                        alt={activeArticle.title}
                        width={1200}
                        height={600}
                        className="w-full max-h-[320px] object-cover rounded-md border"
                      />
                    )}

                    <p className="text-muted-foreground">{activeArticle.summary}</p>

                    <div className="flex gap-2 flex-wrap">
                      {activeArticle.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          #{tag}
                        </Badge>
                      ))}
                    </div>

                    <article className="markdown-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeArticle.bodyMarkdown}</ReactMarkdown>
                    </article>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Toaster />

      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Article" : "Create Article"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Title</label>
              <Input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Summary</label>
              <Textarea rows={2} value={form.summary} onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))} />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Author</label>
                <Input value={form.authorName} onChange={(e) => setForm((prev) => ({ ...prev, authorName: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Status</label>
                <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as ArticleStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Image URL (optional)</label>
              <Input value={form.imageUrl} onChange={(e) => setForm((prev) => ({ ...prev, imageUrl: e.target.value }))} />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Tags (comma-separated)</label>
              <Input value={form.tags} onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))} placeholder="troubleshooting, emr, strides" />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Markdown Content</label>
              <Textarea
                rows={14}
                value={form.bodyMarkdown}
                onChange={(e) => setForm((prev) => ({ ...prev, bodyMarkdown: e.target.value }))}
                placeholder={"## Heading\n\n- bullet one\n- bullet two\n\n**bold text**"}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditor(false)}>Cancel</Button>
            <Button onClick={saveArticle} disabled={isSaving}>
              {isSaving ? "Saving..." : editingId ? "Update Article" : "Create Article"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

