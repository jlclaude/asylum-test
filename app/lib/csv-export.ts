export function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvDocument(headers: string[], rows: unknown[][]) {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

type ClaimExport = {
  raffleCode: string;
  gameTitle: string;
  claims: Array<{
    id: string;
    displayName: string;
    quantity: number;
    status: string;
    externalPayment: boolean;
    createdAt: string;
  }>;
};

export function claimsCsv(input: ClaimExport[]) {
  const rows: unknown[][] = [];
  for (const game of input) {
    [...game.claims]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
      .forEach((claim, index) => rows.push([
        game.raffleCode,
        game.gameTitle,
        index + 1,
        claim.displayName,
        claim.quantity,
        claim.status,
        claim.status === "CONFIRMED" && claim.externalPayment ? "CONFIRMED PAID" : claim.externalPayment ? "PAID" : "UNPAID",
        claim.createdAt,
        "",
        "",
      ]));
  }
  return csvDocument([
    "Raffle Code", "Game Title", "Claim Sequence", "Display Name", "Quantity",
    "Claim Status", "Paid/Confirmed State", "Created At", "Confirmed At", "Canceled At",
  ], rows);
}

type WinnerExport = {
  raffleCode: string;
  gameTitle: string;
  archived: boolean;
  secondChanceOffset: number;
  run: null | {
    secondChanceBeforeDisplayName: string | null;
    secondChanceAfterDisplayName: string | null;
    rounds: Array<{
      position: number;
      title: string | null;
      wheels: Array<{
        position: number;
        label: string;
        type: string;
        winnerDisplayName: string | null;
        winnerValue: string | null;
        completedAt: string | null;
        spinDurationSeconds: number | null;
      }>;
    }>;
  };
};

export function winnersCsv(input: WinnerExport[]) {
  const rows: unknown[][] = [];
  for (const game of input) {
    const rounds = [...(game.run?.rounds ?? [])].sort((a, b) => a.position - b.position);
    for (const round of rounds) {
      for (const wheel of [...round.wheels].sort((a, b) => a.position - b.position)) {
        if (!wheel.completedAt) continue;
        rows.push([
          game.raffleCode,
          game.gameTitle,
          round.title ?? `Round ${round.position}`,
          wheel.label,
          wheel.type,
          wheel.winnerDisplayName ?? wheel.winnerValue ?? "",
          wheel.completedAt,
          wheel.spinDurationSeconds,
          game.run?.secondChanceBeforeDisplayName ?? "",
          game.run?.secondChanceAfterDisplayName ?? "",
          game.secondChanceOffset,
          game.archived ? "ARCHIVED" : "ACTIVE",
        ]);
      }
    }
  }
  return csvDocument([
    "Raffle Code", "Game Title", "Round", "Wheel Label", "Wheel Type", "Winner",
    "Completed At", "Spin Duration Seconds", "Second Chance Before Winner",
    "Second Chance After Winner", "Second Chance Offset", "Archived Status",
  ], rows);
}

type PrizeClaimExport = {
  raffleCode: string;
  gameTitle: string;
  winnerDisplayName: string;
  wheelLabel: string;
  status: string;
  selectedPrizeOptionLabel: string | null;
  selectedBalls: Array<{ title?: string; productTitle?: string; weight?: string | number | null }>;
  recipientName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
  country: string | null;
  winnerNotes: string | null;
  generatedAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  fulfilledAt: string | null;
};

export function prizeClaimsCsv(input: PrizeClaimExport[]) {
  return csvDocument([
    "Raffle Code", "Game Title", "Winner Display Name", "Source Containment",
    "Prize Claim Status", "Selected Package", "Selected Ball 1", "Weight 1",
    "Selected Ball 2", "Weight 2", "Recipient Name", "Address Line 1",
    "Address Line 2", "City", "State/Province", "Postal Code", "Country", "Notes",
    "Generated At", "Submitted At", "Reviewed At", "Fulfilled At",
  ], input.map((claim) => {
    const first = claim.selectedBalls[0];
    const second = claim.selectedBalls[1];
    return [
      claim.raffleCode, claim.gameTitle, claim.winnerDisplayName, claim.wheelLabel,
      claim.status, claim.selectedPrizeOptionLabel, first?.productTitle ?? first?.title ?? "",
      first?.weight ?? "", second?.productTitle ?? second?.title ?? "", second?.weight ?? "",
      claim.recipientName, claim.addressLine1, claim.addressLine2, claim.city,
      claim.stateProvince, claim.postalCode, claim.country, claim.winnerNotes,
      claim.generatedAt, claim.submittedAt, claim.reviewedAt, claim.fulfilledAt,
    ];
  }));
}
