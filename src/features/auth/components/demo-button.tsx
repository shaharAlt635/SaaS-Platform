"use client";

import { Sparkles } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import { signInAsDemoAction } from "../actions";

function Submit({ children, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} {...props}>
      {!pending && <Sparkles />}
      {children}
    </Button>
  );
}

export function DemoButton({ children = "Explore the live demo", ...props }: ButtonProps) {
  return (
    <form action={signInAsDemoAction}>
      <Submit {...props}>{children}</Submit>
    </form>
  );
}
