import { NextRequest, NextResponse } from "next/server"
import { createArticle, getArticles } from "@/lib/articles"
import { getRoleFromRequest } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get("status")
    const articles = await getArticles()
    const filtered = status
      ? articles.filter((article) => article.status === status)
      : articles

    return NextResponse.json({ articles: filtered })
  } catch (error) {
    console.error("GET /api/articles error:", error)
    return NextResponse.json({ error: "Failed to fetch articles" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const role = getRoleFromRequest(request)
    if (!role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (role !== "admin" && role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden: admin or superadmin only" }, { status: 403 })
    }

    const body = await request.json()
    const { title, summary, bodyMarkdown, imageUrl, authorName, tags, status } = body

    if (!title?.trim() || !summary?.trim() || !bodyMarkdown?.trim() || !authorName?.trim()) {
      return NextResponse.json(
        { error: "title, summary, bodyMarkdown, and authorName are required" },
        { status: 400 }
      )
    }

    const article = await createArticle({
      title,
      summary,
      bodyMarkdown,
      imageUrl: imageUrl || null,
      authorName,
      tags: Array.isArray(tags) ? tags : [],
      status: status === "draft" ? "draft" : "published",
    })

    return NextResponse.json({ article }, { status: 201 })
  } catch (error) {
    console.error("POST /api/articles error:", error)
    return NextResponse.json({ error: "Failed to create article" }, { status: 500 })
  }
}

