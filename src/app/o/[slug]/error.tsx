"use client";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";

export default function OrganizationError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Alert
      variant="destructive"
      title="We couldn't load this page"
      action={
        <Button size="sm" variant="outline" onClick={reset}>
          Retry
        </Button>
      }
    >
      Something went wrong on our side.{error.digest ? ` Reference: ${error.digest}` : ""}
    </Alert>
  );
}
