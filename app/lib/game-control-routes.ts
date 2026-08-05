export type GameControlRouteMode = "SHOPIFY_ADMIN" | "HOST_PORTAL";

export function gameControlRoutes(
  mode: GameControlRouteMode,
  gameId: string,
  csrfToken?: string | null,
) {
  const base = mode === "HOST_PORTAL" ? "/host" : "/app";
  const exportCsrf =
    mode === "HOST_PORTAL" && csrfToken
      ? `&csrf=${encodeURIComponent(csrfToken)}`
      : "";
  return {
    base,
    dashboard: base,
    settings: `${base}/settings`,
    play: `${base}/games/${gameId}/play`,
    broadcast: `${base}/games/${gameId}/broadcast`,
    archived: `${base}/games/archived`,
    prizeClaims: `${base}/prize-claims`,
    exportUrl: (type: "raffle-json" | "claims-csv" | "winners-csv") =>
      `${base}/backups/export?type=${type}&gameId=${encodeURIComponent(gameId)}${exportCsrf}`,
  } as const;
}

export type GameControlPermissions = {
  canEditClaims: boolean;
  canConfirmPayments: boolean;
  canStartGame: boolean;
  canManageTemplates: boolean;
  canExport: boolean;
  canArchive: boolean;
  canDelete: boolean;
  canEditPaymentInstructions: boolean;
  canCreatePrizeClaims: boolean;
  canManageGame: boolean;
};

export const shopifyGameControlPermissions: GameControlPermissions = {
  canEditClaims: true,
  canConfirmPayments: true,
  canStartGame: true,
  canManageTemplates: true,
  canExport: true,
  canArchive: true,
  canDelete: true,
  canEditPaymentInstructions: true,
  canCreatePrizeClaims: true,
  canManageGame: true,
};

export function hostGameControlPermissions(
  permissions: readonly string[],
): GameControlPermissions {
  const has = (permission: string) => permissions.includes(permission);
  return {
    canEditClaims: has("claims:manage"),
    canConfirmPayments: has("claims:manage"),
    canStartGame: has("wheels:operate"),
    canManageTemplates: has("games:manage"),
    canExport: has("backups:manage"),
    canArchive: has("games:archive"),
    canDelete: has("games:delete"),
    canEditPaymentInstructions: has("settings:manage"),
    canCreatePrizeClaims: has("prizeClaims:manage"),
    canManageGame: has("games:manage"),
  };
}
