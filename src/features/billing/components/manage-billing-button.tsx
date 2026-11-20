"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/use-action";
import { openBillingPortalAction } from "../actions";

export function ManageBillingButton({ slug, disabled }: { slug: string; disabled?: boolean }) {
  const { execute, pending } = useAction(openBillingPortalAction, { onSuccess: ({ url }) => window.location.assign(url) });
  return (
    <Button variant="outline" size="sm" loading={pending} disabled={disabled} onClick={() => execute(slug)}>
      Manage billing {!pending && <ExternalLink />}
    </Button>
  );
}
