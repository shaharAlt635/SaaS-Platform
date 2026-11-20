"use client";

import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import type { FieldErrors } from "@/domain/errors";
import type { ActionResult } from "./action-result";

/**
 * Wraps a server action: tracks pending state, surfaces field errors,
 * and reports success/failure with toasts.
 */
export function useAction<TArgs extends unknown[], TData>(
  action: (...args: TArgs) => Promise<ActionResult<TData>>,
  options: { successMessage?: string | ((data: TData) => string); onSuccess?: (data: TData) => void } = {},
) {
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const { successMessage, onSuccess } = options;

  const execute = useCallback(
    (...args: TArgs) =>
      startTransition(async () => {
        const result = await action(...args);
        if (result.ok) {
          setFieldErrors({});
          const message = typeof successMessage === "function" ? successMessage(result.data) : successMessage;
          if (message) toast.success(message);
          onSuccess?.(result.data);
        } else {
          setFieldErrors(result.fieldErrors ?? {});
          toast.error(result.error);
        }
      }),
    [action, successMessage, onSuccess],
  );

  return { execute, pending, fieldErrors, fieldError: (name: string) => fieldErrors[name]?.[0] };
}
