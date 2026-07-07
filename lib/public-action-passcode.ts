import { prisma } from "@/lib/prisma"

export const PUBLIC_ACTION_PASSCODE_KEY = "public_asset_actions_passcode"
export const DEFAULT_PUBLIC_ACTION_PASSCODE = "lcwaikiki"

export async function getPublicActionPasscode(): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key: PUBLIC_ACTION_PASSCODE_KEY } })
  return row?.value?.trim() || DEFAULT_PUBLIC_ACTION_PASSCODE
}

export async function verifyPublicActionPasscode(candidate: string | undefined): Promise<boolean> {
  const expected = await getPublicActionPasscode()
  return candidate?.trim() === expected
}
