"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isPlaidConfigured } from "@/lib/config";
import { syncItem } from "@/lib/server/plaid-items";

export async function syncAllAction(): Promise<void> {
  const user = await requireUser();
  if (user.isDemo || !isPlaidConfigured()) return;
  const items = await prisma.plaidItem.findMany({ where: { userId: user.id }, select: { id: true } });
  for (const i of items) {
    try {
      await syncItem(user.id, i.id);
    } catch (e) {
      console.error("[plaid] sync", (e as Error).message);
    }
  }
  revalidatePath("/", "layout");
}
