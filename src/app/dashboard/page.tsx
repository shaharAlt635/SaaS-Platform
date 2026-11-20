import { redirect } from "next/navigation";
import { listOrganizations } from "@/application/use-cases/organizations";
import { container } from "@/infrastructure/container";
import { requireActor } from "@/server/session";

/** Entry point after sign-in: send the user to their first organization, or onboarding. */
export default async function DashboardRedirect() {
  const actor = await requireActor();
  const [first] = await listOrganizations(container, actor);
  redirect(first ? `/o/${first.slug}` : "/onboarding");
}
