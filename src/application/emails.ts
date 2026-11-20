import { ROLE_META, type Role } from "@/domain/rbac";

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function layout(appName: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:ui-sans-serif,system-ui,sans-serif;color:#18181b">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td style="font-weight:600;font-size:16px;padding-bottom:24px">${escapeHtml(appName)}</td></tr>
<tr><td style="font-size:14px;line-height:22px">${body}</td></tr>
</table></td></tr></table></body></html>`;
}

function button(url: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(label)}</a></p>
<p style="color:#71717a;font-size:12px">Or paste this link into your browser:<br>${escapeHtml(url)}</p>`;
}

export function invitationEmail(input: {
  appName: string;
  organizationName: string;
  inviterName: string;
  role: Role;
  url: string;
}): EmailContent {
  const role = ROLE_META[input.role].label;
  const subject = `${input.inviterName} invited you to join ${input.organizationName} on ${input.appName}`;
  return {
    subject,
    html: layout(
      input.appName,
      `<p><strong>${escapeHtml(input.inviterName)}</strong> invited you to join <strong>${escapeHtml(input.organizationName)}</strong> as ${escapeHtml(role)}.</p>
${button(input.url, "Accept invitation")}
<p style="color:#71717a;font-size:12px">This invitation expires in 7 days. If you weren't expecting it, you can ignore this email.</p>`,
    ),
    text: `${subject} as ${role}.\n\nAccept the invitation: ${input.url}\n\nThis invitation expires in 7 days.`,
  };
}

export function actionLinkEmail(input: { appName: string; subject: string; intro: string; cta: string; url: string }): EmailContent {
  return {
    subject: input.subject,
    html: layout(input.appName, `<p>${escapeHtml(input.intro)}</p>${button(input.url, input.cta)}`),
    text: `${input.intro}\n\n${input.cta}: ${input.url}`,
  };
}
