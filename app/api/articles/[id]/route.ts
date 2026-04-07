import { NextRequest, NextResponse } from "next/server"
import { getArticles, updateArticle } from "@/lib/articles"
import { getRoleFromRequest } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0

export async function GET(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const { id } = context.params
    const articles = await getArticles()
    const article = articles.find((item) => item.id === id)
    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 })
    }
    return NextResponse.json({ article })
  } catch (error) {
    console.error("GET /api/articles/[id] error:", error)
    return NextResponse.json({ error: "Failed to fetch article" }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const role = getRoleFromRequest(request)
    if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (role !== "admin" && role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden: admin or superadmin only" }, { status: 403 })
    }

    const { id } = context.params
    const body = await request.json()
    const { title, summary, bodyMarkdown, imageUrl, authorName, tags, status } = body

    const article = await updateArticle(id, {
      title,
      summary,
      bodyMarkdown,
      imageUrl: imageUrl ?? null,
      authorName,
      tags: Array.isArray(tags) ? tags : undefined,
      status: status === "draft" ? "draft" : status === "published" ? "published" : undefined,
    })

    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 })
    }

    return NextResponse.json({ article })
  } catch (error) {
    console.error("PATCH /api/articles/[id] error:", error)
    return NextResponse.json({ error: "Failed to update article" }, { status: 500 })
  }
}

