import { Prisma } from "@prisma/client";
import { data } from "react-router";
import {
  createPublicClaim,
  getClaimTotals,
  updateClaimDisplayName,
  updateClaim,
} from "../models/claim.server";
import {
  archiveGame,
  duplicateGameSetup,
  getGameForShop,
  permanentlyDeleteGame,
  restoreGame,
  updateGameStatus,
} from "../models/game.server";
import { createGameTemplate } from "../models/game-template.server";
import {
  gameSetupTemplateInput,
  validateGameTemplate,
} from "../lib/game-template-validation";
import {
  PRIZE_CLAIM_EXPIRATION_DAYS,
  type PrizeClaimExpirationDays,
} from "../lib/prize-claim";
import { buildPrizeClaimUrl } from "../lib/prize-claim-token.server";
import { validateAdminPrizePackageOptions } from "../lib/prize-packages";
import { verifyPrizeOptionCollections } from "../lib/shopify-prize-products.server";
import {
  createWinnerPrizeClaim,
  updatePrizeClaimStatus,
} from "../models/prize-claim.server";
import {
  repairGameReadiness,
  runGameReadinessCheck,
  type ReadinessRepairIntent,
} from "./game-readiness.server";
import { gameControlRoutes } from "../lib/game-control-routes";
import type { OperatorContext } from "../lib/operator-context.server";

export type GameControlActionData = {
  error?: string;
  success?: string;
  intent?: string;
  claimId?: string;
  wheelId?: string;
  privateUrl?: string;
  readiness?: import("../lib/game-readiness").GameReadinessReport;
};

export async function handleGameControlAction(input: {
  request: Request;
  gameId: string | undefined;
  operator: OperatorContext;
  admin?: Parameters<typeof verifyPrizeOptionCollections>[0];
  routes: ReturnType<typeof gameControlRoutes>;
  redirect: (url: string) => Response;
  formData?: FormData;
}) {
  const { request, gameId, operator, admin, routes, redirect } = input;
  const { shop } = operator;
  if (!gameId) return { error: "Game ID is missing." };

  const game = await getGameForShop(gameId, shop);
  if (!game) return { error: "Game not found." };

  const formData = input.formData ?? (await request.formData());
  const intent = String(formData.get("intent") ?? "");

  try {
    if (["run-readiness", "open-wheels", "open-broadcast"].includes(intent)) {
      const readiness = await runGameReadinessCheck(game.id, shop);
      if (readiness.isReady && intent === "open-wheels")
        return redirect(routes.play);
      if (readiness.isReady && intent === "open-broadcast")
        return redirect(routes.broadcast);
      return {
        intent,
        readiness,
        ...(readiness.isReady
          ? { success: "Game readiness checks passed." }
          : {
              error: `${readiness.blockingCount} blocking issues must be resolved before opening wheels.`,
            }),
      };
    }

    if (intent === "repair-readiness") {
      const repairIntent = String(
        formData.get("repairIntent") ?? "",
      ) as ReadinessRepairIntent;
      const allowed: ReadinessRepairIntent[] = [
        "repair-wheel-labels",
        "repair-name-snapshots",
        "repair-reward-chamber",
        "reconcile-elapsed-spin",
      ];
      if (!allowed.includes(repairIntent))
        return { error: "Unknown readiness repair.", intent };
      const result = await repairGameReadiness({
        gameId: game.id,
        shop: shop,
        intent: repairIntent,
        affectedId:
          String(formData.get("affectedId") ?? "").trim() || undefined,
      });
      const readiness = await runGameReadinessCheck(game.id, shop);
      return { intent, success: result.message, readiness };
    }

    if (intent === "duplicate-game") {
      const duplicate = await duplicateGameSetup(game.id, shop);
      return redirect(`${routes.base}/games/${duplicate.id}?duplicated=1`);
    }

    if (intent === "archive-game") {
      await archiveGame(game.id, shop);
      return {
        success: "Game archived. All claims and results were preserved.",
        intent,
      };
    }

    if (intent === "restore-game") {
      const result = await restoreGame(game.id, shop);
      return result.count
        ? {
            success: "Game restored with its original gameplay status.",
            intent,
          }
        : { error: "Only an archived game can be restored.", intent };
    }

    if (intent === "delete-game") {
      await permanentlyDeleteGame(
        game.id,
        shop,
        String(formData.get("deleteConfirmation") ?? ""),
      );
      return redirect(`${routes.archived}?deleted=1`);
    }

    if (intent === "edit-claim-name") {
      const claimId = String(formData.get("claimId") ?? "").trim();
      if (!claimId) return { error: "Claim ID is missing.", intent };

      const result = await updateClaimDisplayName({
        shop: shop,
        gameId: game.id,
        claimId,
        displayName: String(formData.get("displayName") ?? ""),
      });

      return {
        success: `Display name updated to “${result.displayName}”.`,
        intent,
        claimId,
      };
    }

    if (intent === "create-prize-claim") {
      if (!admin)
        return { error: "Shopify prize verification is unavailable.", intent };
      const wheelId = String(formData.get("wheelId") ?? "").trim();
      const expirationDays = Number(formData.get("expirationDays"));
      if (
        !PRIZE_CLAIM_EXPIRATION_DAYS.includes(
          expirationDays as PrizeClaimExpirationDays,
        )
      )
        return { error: "Select a valid expiration period.", intent, wheelId };
      const packageValidation = validateAdminPrizePackageOptions(
        formData.get("prizeOptionsJson"),
      );
      if ("error" in packageValidation)
        return { error: packageValidation.error, intent, wheelId };
      const verifiedOptions = await verifyPrizeOptionCollections(
        admin,
        packageValidation.options,
      );
      const result = await createWinnerPrizeClaim({
        shop: shop,
        gameId: game.id,
        gameWheelId: wheelId,
        expirationDays: expirationDays as PrizeClaimExpirationDays,
        prizeOptions: verifiedOptions,
      });
      if (!result.created)
        return {
          success: "An active claim link already exists for this winner.",
          intent,
          wheelId,
        };
      const privateUrl = buildPrizeClaimUrl(
        result.token,
        new URL(request.url).origin,
      );
      return data<GameControlActionData>(
        {
          success: "Private prize claim link created.",
          intent,
          wheelId,
          privateUrl,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (["revoke-prize-claim", "fulfill-prize-claim"].includes(intent)) {
      const prizeClaimId = String(formData.get("prizeClaimId") ?? "").trim();
      const wheelId = String(formData.get("wheelId") ?? "").trim();
      await updatePrizeClaimStatus({
        id: prizeClaimId,
        shop: shop,
        action: intent === "revoke-prize-claim" ? "revoke" : "fulfill",
      });
      return {
        success:
          intent === "revoke-prize-claim"
            ? "Prize claim link revoked."
            : "Prize claim marked fulfilled.",
        intent,
        wheelId,
      };
    }

    if (game.archivedAt) {
      return {
        error: "This game is archived. Restore it before making changes.",
        intent,
      };
    }

    if (intent === "save-game-template") {
      const templateName = String(formData.get("templateName") ?? "").trim();
      const setupInput = gameSetupTemplateInput(templateName, game);
      const validation = validateGameTemplate({
        name: setupInput.name,
        description: "",
        defaultGameTitle: setupInput.defaultGameTitle ?? "",
        defaultGameDescription: setupInput.defaultGameDescription ?? "",
        totalSpots: String(setupInput.totalSpots),
        pricePerSpot: setupInput.pricePerSpot,
        wheelCount: String(setupInput.wheelCount),
        initialStatus: setupInput.initialStatus,
        isDefault: setupInput.isDefault,
      });
      if (!validation.input) {
        return {
          error: validation.errors.name ?? "The game setup is not valid.",
          intent,
        };
      }
      await createGameTemplate(shop, validation.input);
      return {
        success: `Saved “${templateName}” as a reusable template.`,
        intent,
      };
    }

    if (intent === "create-claim") {
      if (game.status !== "OPEN") {
        return { error: "This game is not accepting new claims.", intent };
      }

      const displayName = String(formData.get("displayName") ?? "").trim();
      const facebookHandle = String(
        formData.get("facebookHandle") ?? "",
      ).trim();
      const comment = String(formData.get("comment") ?? "").trim();
      const quantity = Number(formData.get("quantity"));

      if (!displayName) {
        return { error: "Enter the member's Facebook display name.", intent };
      }

      if (!Number.isInteger(quantity) || quantity < 1) {
        return {
          error: "Quantity must be a whole number of at least 1.",
          intent,
        };
      }

      const reservation = await createPublicClaim({
        gameId: game.id,
        displayName,
        facebookHandle,
        quantity,
        comment,
      });
      if (!reservation.success) return { error: reservation.error, intent };

      return {
        success: `${quantity} ${quantity === 1 ? "spot was" : "spots were"} added for ${displayName}.`,
        intent,
      };
    }

    if (intent === "close-game") {
      if (game.status !== "OPEN") {
        return { error: "Only an open game can be closed.", intent };
      }

      const result = await updateGameStatus(game.id, shop, "CLOSED", "OPEN");
      if (result.count === 0)
        return { error: "This game changed in another session. The latest state has been loaded.", intent };

      return {
        success: "Game closed. New public claims are disabled.",
        intent,
      };
    }

    if (intent === "reopen-game") {
      if (game.status !== "CLOSED") {
        return { error: "Only a closed game can be reopened.", intent };
      }

      const totals = await getClaimTotals(game.id);
      const remaining = game.totalSpots - totals.reservedQuantity;
      if (remaining <= 0)
        return { error: "This game is full and cannot be reopened.", intent };

      const result = await updateGameStatus(game.id, shop, "OPEN", "CLOSED");
      if (result.count === 0)
        return { error: "This game changed in another session. The latest state has been loaded.", intent };

      return { success: "Game reopened. Public claims are enabled.", intent };
    }

    if (["READY", "IN_PROGRESS", "COMPLETED"].includes(game.status)) {
      return {
        error: "Claims are locked because Game Mode has already begun.",
        intent,
      };
    }

    const claimId = String(formData.get("claimId") ?? "").trim();
    if (!claimId) return { error: "Claim ID is missing.", intent };

    if (intent === "confirm-claim") {
      const result = await updateClaim(claimId, game.id, {
        status: "CONFIRMED",
        externalPayment: true,
      }, "PENDING", true);

      if (result.count === 0) {
        return { error: "This claim changed in another session. The latest state has been loaded.", intent };
      }

      return { success: "Payment confirmed and claim approved.", intent };
    }

    if (intent === "cancel-claim") {
      const result = await updateClaim(claimId, game.id, {
        status: "CANCELED",
        externalPayment: false,
      }, "PENDING", true);

      if (result.count === 0) {
        return { error: "This claim changed in another session. The latest state has been loaded.", intent };
      }

      return { success: "Claim canceled and spots released.", intent };
    }

    return { error: "Unknown action.", intent };
  } catch (error) {
    console.error("Game action failed:", { intent, gameId: game.id, error });
    return {
      error:
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
          ? "A template with this name already exists for this shop."
          : error instanceof Error
            ? error.message
            : "The action could not be completed.",
      intent,
    };
  }
}
