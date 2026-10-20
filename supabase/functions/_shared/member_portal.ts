export const MEMBER_PORTAL_LINK =
  "https://malangawelfare.co.ke/login?role=member";

export function canonicalizeMemberPortalLink(message: string): string {
  return message
    .replaceAll("{portalLink}", MEMBER_PORTAL_LINK)
    .replace(/https?:\/\/(?:www\.)?malangawelfare\.org/gi, "https://malangawelfare.co.ke")
    .replace(/\b(?:www\.)?malangawelfare\.org\b/gi, "malangawelfare.co.ke");
}

export function ensureMemberPortalLink(message: string): string {
  const canonicalMessage = canonicalizeMemberPortalLink(message);
  return /malangawelfare\.co\.ke/i.test(canonicalMessage)
    ? canonicalMessage
    : `${canonicalMessage.trim()} Member portal: ${MEMBER_PORTAL_LINK}`;
}
