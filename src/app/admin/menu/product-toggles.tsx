"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { setProductFlag } from "./actions";

export function ProductToggles({ id, available, archived }: { id: string; available: boolean; archived: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const flip = (flag: "is_available" | "is_archived", value: boolean, msg: string) =>
    start(async () => {
      const res = await setProductFlag(id, flag, value);
      if (res.ok) toast.success(msg);
      else toast.error(res.error);
      router.refresh();
    });
  return (
    <div className="flex gap-1.5">
      {!archived ? (
        <Button size="sm" variant={available ? "outline" : "gold"} disabled={pending} onClick={() => flip("is_available", !available, available ? "Marked sold out." : "Back on sale.")}>
          {available ? "Mark sold out" : "Mark available"}
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => flip("is_archived", !archived, archived ? "Restored to menu." : "Archived.")}>
        {archived ? "Restore" : "Archive"}
      </Button>
    </div>
  );
}
