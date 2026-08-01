export function formatPublicName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length < 2) {
    return parts[0] || "Member";
  }

  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}
