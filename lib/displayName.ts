type NamedProfile = { full_name?: string | null; email?: string | null } | null | undefined;

// Turns an email local-part like "pierson.willhite" into "Pierson Willhite"
// so it reads as a name instead of a stray fragment of an email address.
function formatEmailLocalPart(localPart: string): string {
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function displayName(profile: NamedProfile, fallback = 'Guest'): string {
  if (!profile) return fallback;
  if (profile.full_name) return profile.full_name;
  if (profile.email) return formatEmailLocalPart(profile.email.split('@')[0]) || fallback;
  return fallback;
}
