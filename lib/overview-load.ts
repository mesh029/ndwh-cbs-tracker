import { prisma } from "@/lib/prisma"
import type { Location } from "@/lib/storage"
import type { OverviewCountyRaw } from "@/lib/overview-stats"
import {
  buildCountyMetrics,
  serverDistributionFromFacilities,
  sumMetrics,
  type OverviewCountyMetrics,
  type OverviewMetricsPayload,
} from "@/lib/overview-metrics"

export type {
  OverviewCountyMetrics,
  OverviewMetricsPayload,
  OverviewServerDistributionItem,
} from "@/lib/overview-metrics"
export { countyMetricsFromRaw, metricsFromRawCounties } from "@/lib/overview-metrics"

const FACILITY_SELECT = {
  id: true,
  name: true,
  location: true,
  subcounty: true,
  serverType: true,
  simcardCount: true,
  hasLAN: true,
} as const

const TICKET_SELECT = {
  location: true,
  status: true,
  issueType: true,
  serverCondition: true,
  facilityName: true,
  problem: true,
} as const

/** One county — used for progressive overview loading. */
export async function loadOverviewCountySlice(location: Location): Promise<OverviewCountyRaw> {
  const [facilities, tickets, servers] = await Promise.all([
    prisma.facility.findMany({
      where: { system: "NDWH", location, isMaster: true },
      orderBy: { name: "asc" },
      select: FACILITY_SELECT,
    }),
    prisma.ticket.findMany({
      where: { location },
      select: TICKET_SELECT,
    }),
    prisma.serverAsset.findMany({
      where: { location },
      select: {
        location: true,
        facilityId: true,
        serverType: true,
        facility: { select: { name: true } },
      },
    }),
  ])

  return {
    location,
    facilities,
    tickets,
    servers: servers.map((s) => ({
      facilityId: s.facilityId,
      facilityName: s.facility.name,
      serverType: s.serverType,
    })),
  }
}

/** Lightweight KPIs — 2 queries, no server assets, small ticket payload. */
export async function loadOverviewMetrics(locations: Location[]): Promise<OverviewMetricsPayload> {
  const [facilities, tickets] = await Promise.all([
    prisma.facility.findMany({
      where: { system: "NDWH", location: { in: locations }, isMaster: true },
      select: { location: true, serverType: true, simcardCount: true, hasLAN: true },
    }),
    prisma.ticket.findMany({
      where: { location: { in: locations } },
      select: {
        location: true,
        status: true,
        issueType: true,
        serverCondition: true,
      },
    }),
  ])

  const counties = locations.map((location) => {
    const locFacilities = facilities.filter((f) => f.location === location)
    const locTickets = tickets.filter((t) => t.location === location)
    return buildCountyMetrics(location, locFacilities, locTickets)
  })

  return {
    totals: sumMetrics(counties),
    counties,
    serverDistribution: serverDistributionFromFacilities(facilities),
  }
}

/** Full bundle — 3 queries for all counties (legacy / cache warm). */
export async function loadAllCounties(locations: Location[]): Promise<OverviewCountyRaw[]> {
  const [facilities, tickets, servers] = await Promise.all([
    prisma.facility.findMany({
      where: { system: "NDWH", location: { in: locations }, isMaster: true },
      orderBy: { name: "asc" },
      select: FACILITY_SELECT,
    }),
    prisma.ticket.findMany({
      where: { location: { in: locations } },
      select: TICKET_SELECT,
    }),
    prisma.serverAsset.findMany({
      where: { location: { in: locations } },
      select: {
        location: true,
        facilityId: true,
        serverType: true,
        facility: { select: { name: true } },
      },
    }),
  ])

  return locations.map((location) => ({
    location,
    facilities: facilities.filter((f) => f.location === location),
    tickets: tickets.filter((t) => t.location === location),
    servers: servers
      .filter((s) => s.location === location)
      .map((s) => ({
        facilityId: s.facilityId,
        facilityName: s.facility.name,
        serverType: s.serverType,
      })),
  }))
}
