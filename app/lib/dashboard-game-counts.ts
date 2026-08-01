import type { GameStatus } from "@prisma/client";

export type DashboardGameCounts = {
  total: number;
  open: number;
  closed: number;
  ready: number;
  inProgress: number;
  completed: number;
};

type StatusCount = {
  status: GameStatus;
  count: number;
};

export function normalizeDashboardGameCounts(
  total: number,
  statusCounts: StatusCount[],
): DashboardGameCounts {
  const counts: DashboardGameCounts = {
    total,
    open: 0,
    closed: 0,
    ready: 0,
    inProgress: 0,
    completed: 0,
  };

  for (const statusCount of statusCounts) {
    switch (statusCount.status) {
      case "OPEN":
        counts.open = statusCount.count;
        break;
      case "CLOSED":
        counts.closed = statusCount.count;
        break;
      case "READY":
        counts.ready = statusCount.count;
        break;
      case "IN_PROGRESS":
        counts.inProgress = statusCount.count;
        break;
      case "COMPLETED":
        counts.completed = statusCount.count;
        break;
    }
  }

  return counts;
}
