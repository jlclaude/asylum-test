import db from "../db.server";
import { formatRaffleCode } from "../lib/raffle-number";
import { deserializeWheelEntries } from "./game-run.server";
import { getSecondChanceResult } from "./second-chance.server";

export async function getBroadcastState(gameId: string) {
  const game = await db.game.findUnique({ where: { id: gameId }, include: { run: { include: { rounds: { orderBy: { position: "asc" }, include: { wheels: { orderBy: { position: "asc" } } } } } } } });
  if (!game) return null;
  const wheels = game.run?.rounds.flatMap((round) => round.wheels) ?? [];
  const spinning = wheels.find((wheel) => wheel.status === "SPINNING");
  const awaiting = [...wheels].reverse().find((wheel) => wheel.status === "COMPLETED" && !wheel.resultAcceptedAt);
  const ready = wheels.find((wheel) => wheel.status === "READY");
  const current = spinning ?? awaiting ?? ready ?? wheels.at(-1) ?? null;
  const secondChance = await getSecondChanceResult(game.id);
  const allCompleted = wheels.length > 0 && wheels.every((wheel) => wheel.status === "COMPLETED" && wheel.resultAcceptedAt);
  const winnerHold = current?.completedAt ? Date.now() - current.completedAt.getTime() < 4_000 : false;
  const state = !game.run ? "WAITING" : allCompleted || game.status === "COMPLETED" ? "COMPLETED" : current?.type === "VALUE" && current.status !== "READY" ? "REWARD_CHAMBER" : current?.status === "SPINNING" ? "SPINNING" : current?.status === "COMPLETED" && secondChance?.sourceWheelId === current.id && !winnerHold ? "SECOND_CHANCE" : current?.status === "COMPLETED" ? "WINNER" : "READY";
  const completedNameWheel = [...wheels].reverse().find((wheel) => wheel.type === "NAME" && wheel.status === "COMPLETED" && wheel.winnerDisplayName);
  const completedRewardWheel = [...wheels].reverse().find((wheel) => wheel.type === "VALUE" && wheel.status === "COMPLETED" && wheel.winnerValue);
  return {
    game: { title: game.title, raffleCode: formatRaffleCode({ year: game.raffleYear, number: game.raffleNumber }), status: game.status },
    state,
    wheel: current ? { label: current.label, type: current.type, status: current.status, entries: deserializeWheelEntries(current.shuffledEntriesJson).map((entry) => "displayName" in entry ? { displayName: entry.displayName } : { value: entry.value }), winnerDisplayName: current.winnerDisplayName, winnerValue: current.winnerValue, winnerEntryIndex: current.winnerEntryIndex, spunAt: current.spunAt?.toISOString() ?? null, completedAt: current.completedAt?.toISOString() ?? null } : null,
    secondChance: secondChance ? { beforeDisplayName: secondChance.beforeDisplayName, afterDisplayName: secondChance.afterDisplayName } : null,
    upcomingPrize: ready?.label ?? null,
    completed: { mainWinner: completedNameWheel?.winnerDisplayName ?? null, reward: completedRewardWheel?.winnerValue ?? null },
  };
}
