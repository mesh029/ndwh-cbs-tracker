"use client"

import { useEffect } from "react"
import { driver } from "driver.js"
import "driver.js/dist/driver.css"
import { Button } from "@/components/ui/button"

const HOME_TOUR_STORAGE_KEY = "home_guided_tour_seen_v1"
let activeHomeTour: ReturnType<typeof driver> | null = null

function runHomeTour() {
  activeHomeTour?.destroy()
  const tour = driver({
    showProgress: true,
    allowClose: true,
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    steps: [
      {
        popover: {
          title: "Welcome to PATH EMR & Assets",
          description: "This short tour shows you where to start for tickets, assets, maps, and articles.",
        },
      },
      {
        element: "#home-sidebar-nav",
        popover: {
          title: "Quick Navigation",
          description: "Use these icons to jump to Tickets, Assets, Dashboard, Reports, and Articles.",
        },
      },
      {
        element: "#home-featured-article",
        popover: {
          title: "Featured Article",
          description: "The most recent published article appears here for quick visibility.",
        },
      },
      {
        element: "#home-map-section",
        popover: {
          title: "Live Distribution Map",
          description: "Switch between Servers and Tickets, filter by county, and zoom for detail.",
        },
      },
      {
        element: "#home-articles-section",
        popover: {
          title: "Latest Briefs",
          description: "Browse recent articles and open full guides from this section.",
        },
      },
    ],
  })

  activeHomeTour = tour
  tour.drive()
}

export function HomeGuidedTour() {
  useEffect(() => {
    if (typeof window === "undefined") return
    const seen = window.localStorage.getItem(HOME_TOUR_STORAGE_KEY)
    if (!seen) {
      runHomeTour()
      window.localStorage.setItem(HOME_TOUR_STORAGE_KEY, "true")
    }
    return () => {
      activeHomeTour?.destroy()
      activeHomeTour = null
    }
  }, [])

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="border-white/50 bg-white/85 text-slate-900 hover:bg-white dark:bg-black/40 dark:text-white dark:border-white/40 dark:hover:bg-black/55"
      onClick={runHomeTour}
    >
      Guided Tour
    </Button>
  )
}
