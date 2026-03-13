import { redirect } from "next/navigation"

export default function Home() {
  // Server-side redirect to county dashboard (overview)
  redirect("/nyamira")
}
