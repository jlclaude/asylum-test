import { useEffect, useMemo, useState } from "react";
import { Prisma } from "@prisma/client";
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";
import {
  data,
  isRouteErrorResponse,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigate,
  useRouteError,
} from "react-router";

import {
  createClaim,
  getClaimNameEditState,
  getClaimsForGame,
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
import { gameSetupTemplateInput, validateGameTemplate } from "../lib/game-template-validation";
import { getGameResults } from "../models/game-results.server";
import { getShopSettings } from "../models/shop-settings.server";
import { GameResultsSummary } from "../components/results/GameResultsSummary";
import { GameAdministration } from "../components/games/GameAdministration";
import { GameReadinessPanel } from "../components/games/GameReadinessPanel";
import { SecondChanceSummary } from "../components/second-chance/SecondChanceSummary";
import { GamePrizeClaims } from "../components/prize-claims/GamePrizeClaims";
import { PRIZE_CLAIM_EXPIRATION_DAYS, type PrizeClaimExpirationDays } from "../lib/prize-claim";
import { buildPrizeClaimUrl } from "../lib/prize-claim-token.server";
import { validateAdminPrizePackageOptions } from "../lib/prize-packages";
import { verifyPrizeOptionCollections } from "../lib/shopify-prize-products.server";
import { createWinnerPrizeClaim, getEligiblePrizeWheels, getPrizeClaimsForGame, toPrizeClaimSummary, updatePrizeClaimStatus } from "../models/prize-claim.server";
import { getSecondChanceResult } from "../models/second-chance.server";
import { renderGameInstructionVariables } from "../lib/game-instruction-variables";
import { authenticate } from "../shopify.server";
import { formatRaffleCode } from "../lib/raffle-number";
import type { GameReadinessReport } from "../lib/game-readiness";
import { repairGameReadiness, runGameReadinessCheck, type ReadinessRepairIntent } from "../services/game-readiness.server";

import "../styles/game-results.css";
import "../styles/prize-claims.css";

export async function loader({
  request,
  params,
}: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  if (!params.id) {
    throw new Response("Game ID is required.", { status: 400 });
  }

  const game = await getGameForShop(params.id, session.shop);

  if (!game) {
    throw new Response("Game not found.", { status: 404 });
  }

  const [claims, totals, results, shopSettings, secondChance, nameEditState, eligiblePrizeWheels, prizeClaims] = await Promise.all([
    getClaimsForGame(game.id),
    getClaimTotals(game.id),
    getGameResults(game.id),
    getShopSettings(session.shop),
    getSecondChanceResult(game.id),
    getClaimNameEditState(game.id, session.shop),
    getEligiblePrizeWheels(game.id, session.shop),
    getPrizeClaimsForGame(game.id, session.shop),
  ]);

  const requestUrl = new URL(request.url);

  return {
    game: {
      id: game.id,
      raffleCode: formatRaffleCode({ year: game.raffleYear, number: game.raffleNumber }),
      title: game.title,
      description: game.description,
      totalSpots: game.totalSpots,
      pricePerSpot: game.pricePerSpot.toString(),
      wheelCount: game.wheelCount,
      status: game.status,
      archivedAt: game.archivedAt?.toISOString() ?? null,
      secondChanceOffset: game.secondChanceOffset,
      createdAt: game.createdAt.toISOString(),
      updatedAt: game.updatedAt.toISOString(),
    },
    claims: claims.map((claim) => ({
      id: claim.id,
      displayName: claim.displayName,
      facebookHandle: claim.facebookHandle,
      quantity: claim.quantity,
      comment: claim.comment,
      status: claim.status,
      externalPayment: claim.externalPayment,
      createdAt: claim.createdAt.toISOString(),
    })),
    totals,
    results,
    paymentInstructionsConfigured: Boolean(shopSettings?.paymentInstructions),
    publicUrl: `${requestUrl.origin}/games/${game.id}`,
    duplicated: requestUrl.searchParams.get("duplicated") === "1",
    secondChance,
    nameEditState,
    eligiblePrizeWheels: eligiblePrizeWheels.map((wheel) => ({ ...wheel, resultAcceptedAt: wheel.resultAcceptedAt?.toISOString() ?? null })),
    prizeClaims: prizeClaims.map(toPrizeClaimSummary),
  };
}

type ActionData = {
  error?: string;
  success?: string;
  intent?: string;
  claimId?: string;
  wheelId?: string;
  privateUrl?: string;
  readiness?: GameReadinessReport;
};

export async function action({
  request,
  params,
}: ActionFunctionArgs) {
  const { session, redirect, admin } = await authenticate.admin(request);

  if (!params.id) return { error: "Game ID is missing." };

  const game = await getGameForShop(params.id, session.shop);
  if (!game) return { error: "Game not found." };

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  try {
    if (["run-readiness", "open-wheels", "open-broadcast"].includes(intent)) {
      const readiness = await runGameReadinessCheck(game.id, session.shop);
      if (readiness.isReady && intent === "open-wheels") return redirect(`/app/games/${game.id}/play`);
      if (readiness.isReady && intent === "open-broadcast") return redirect(`/app/games/${game.id}/broadcast`);
      return {
        intent,
        readiness,
        ...(readiness.isReady ? { success: "Game readiness checks passed." } : { error: `${readiness.blockingCount} blocking issues must be resolved before opening wheels.` }),
      };
    }

    if (intent === "repair-readiness") {
      const repairIntent = String(formData.get("repairIntent") ?? "") as ReadinessRepairIntent;
      const allowed: ReadinessRepairIntent[] = ["repair-wheel-labels", "repair-name-snapshots", "repair-reward-chamber", "reconcile-elapsed-spin"];
      if (!allowed.includes(repairIntent)) return { error: "Unknown readiness repair.", intent };
      const result = await repairGameReadiness({ gameId: game.id, shop: session.shop, intent: repairIntent, affectedId: String(formData.get("affectedId") ?? "").trim() || undefined });
      const readiness = await runGameReadinessCheck(game.id, session.shop);
      return { intent, success: result.message, readiness };
    }

    if (intent === "duplicate-game") {
      const duplicate = await duplicateGameSetup(game.id, session.shop);
      return redirect(`/app/games/${duplicate.id}?duplicated=1`);
    }

    if (intent === "archive-game") {
      await archiveGame(game.id, session.shop);
      return { success: "Game archived. All claims and results were preserved.", intent };
    }

    if (intent === "restore-game") {
      const result = await restoreGame(game.id, session.shop);
      return result.count
        ? { success: "Game restored with its original gameplay status.", intent }
        : { error: "Only an archived game can be restored.", intent };
    }

    if (intent === "delete-game") {
      await permanentlyDeleteGame(
        game.id,
        session.shop,
        String(formData.get("deleteConfirmation") ?? ""),
      );
      return redirect("/app/games/archived?deleted=1");
    }

    if (intent === "edit-claim-name") {
      const claimId = String(formData.get("claimId") ?? "").trim();
      if (!claimId) return { error: "Claim ID is missing.", intent };

      const result = await updateClaimDisplayName({
        shop: session.shop,
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
      const wheelId = String(formData.get("wheelId") ?? "").trim();
      const expirationDays = Number(formData.get("expirationDays"));
      if (!PRIZE_CLAIM_EXPIRATION_DAYS.includes(expirationDays as PrizeClaimExpirationDays)) return { error: "Select a valid expiration period.", intent, wheelId };
      const packageValidation = validateAdminPrizePackageOptions(formData.get("prizeOptionsJson"));
      if ("error" in packageValidation) return { error: packageValidation.error, intent, wheelId };
      const verifiedOptions = await verifyPrizeOptionCollections(admin, packageValidation.options);
      const result = await createWinnerPrizeClaim({ shop: session.shop, gameId: game.id, gameWheelId: wheelId, expirationDays: expirationDays as PrizeClaimExpirationDays, prizeOptions: verifiedOptions });
      if (!result.created) return { success: "An active claim link already exists for this winner.", intent, wheelId };
      const privateUrl = buildPrizeClaimUrl(result.token, new URL(request.url).origin);
      return data<ActionData>(
        { success: "Private prize claim link created.", intent, wheelId, privateUrl },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (["revoke-prize-claim", "fulfill-prize-claim"].includes(intent)) {
      const prizeClaimId = String(formData.get("prizeClaimId") ?? "").trim();
      const wheelId = String(formData.get("wheelId") ?? "").trim();
      await updatePrizeClaimStatus({ id: prizeClaimId, shop: session.shop, action: intent === "revoke-prize-claim" ? "revoke" : "fulfill" });
      return { success: intent === "revoke-prize-claim" ? "Prize claim link revoked." : "Prize claim marked fulfilled.", intent, wheelId };
    }

    if (game.archivedAt) {
      return { error: "This game is archived. Restore it before making changes.", intent };
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
        return { error: validation.errors.name ?? "The game setup is not valid.", intent };
      }
      await createGameTemplate(session.shop, validation.input);
      return { success: `Saved “${templateName}” as a reusable template.`, intent };
    }

    if (intent === "create-claim") {
      if (game.status !== "OPEN") {
        return { error: "This game is not accepting new claims.", intent };
      }

      const displayName = String(formData.get("displayName") ?? "").trim();
      const facebookHandle = String(formData.get("facebookHandle") ?? "").trim();
      const comment = String(formData.get("comment") ?? "").trim();
      const quantity = Number(formData.get("quantity"));

      if (!displayName) {
        return { error: "Enter the member's Facebook display name.", intent };
      }

      if (!Number.isInteger(quantity) || quantity < 1) {
        return { error: "Quantity must be a whole number of at least 1.", intent };
      }

      const totals = await getClaimTotals(game.id);
      const remaining = game.totalSpots - totals.reservedQuantity;

      if (quantity > remaining) {
        return {
          error: remaining > 0 ? `Only ${remaining} spots remain.` : "This game is full.",
          intent,
        };
      }

      await createClaim({
        gameId: game.id,
        displayName,
        facebookHandle,
        quantity,
        comment,
      });

      return {
        success: `${quantity} ${quantity === 1 ? "spot was" : "spots were"} added for ${displayName}.`,
        intent,
      };
    }

    if (intent === "close-game") {
      if (game.status !== "OPEN") {
        return { error: "Only an open game can be closed.", intent };
      }

      const result = await updateGameStatus(game.id, session.shop, "CLOSED");
      if (result.count === 0) return { error: "The game could not be closed.", intent };

      return { success: "Game closed. New public claims are disabled.", intent };
    }

    if (intent === "reopen-game") {
      if (game.status !== "CLOSED") {
        return { error: "Only a closed game can be reopened.", intent };
      }

      const totals = await getClaimTotals(game.id);
      const remaining = game.totalSpots - totals.reservedQuantity;
      if (remaining <= 0) return { error: "This game is full and cannot be reopened.", intent };

      const result = await updateGameStatus(game.id, session.shop, "OPEN");
      if (result.count === 0) return { error: "The game could not be reopened.", intent };

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
      });

      if (result.count === 0) {
        return { error: "The claim could not be found or updated.", intent };
      }

      return { success: "Payment confirmed and claim approved.", intent };
    }

    if (intent === "cancel-claim") {
      const result = await updateClaim(claimId, game.id, {
        status: "CANCELED",
        externalPayment: false,
      });

      if (result.count === 0) {
        return { error: "The claim could not be found or updated.", intent };
      }

      return { success: "Claim canceled and spots released.", intent };
    }

    return { error: "Unknown action.", intent };
  } catch (error) {
    console.error("Game action failed:", { intent, gameId: game.id, error });
    return {
      error: error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
        ? "A template with this name already exists for this shop."
        : error instanceof Error ? error.message : "The action could not be completed.",
      intent,
    };
  }
}

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

const styles = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  .control-page { min-height:100%; padding:28px; color:#f5f5f5; background:radial-gradient(circle at top right,rgba(155,22,34,.18),transparent 35%),linear-gradient(145deg,#0d0d0f 0%,#171719 52%,#101012 100%); font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
  .control-shell { width:min(1220px,100%); margin:0 auto; }
  .control-back { margin-bottom:22px; padding:0; border:0; color:#9a9ba1; background:transparent; cursor:pointer; font:inherit; font-size:14px; font-weight:750; }
  .control-header { display:flex; align-items:flex-end; justify-content:space-between; gap:24px; margin-bottom:22px; }
  .control-eyebrow { margin:0 0 8px; color:#e44e5e; font-size:12px; font-weight:850; letter-spacing:.15em; text-transform:uppercase; }
  .control-header h1 { margin:0; font-size:clamp(30px,5vw,46px); line-height:1.08; }
  .control-description { max-width:720px; margin:13px 0 0; color:#999aa0; white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.6; }
  .control-status { flex:0 0 auto; padding:8px 12px; border-radius:999px; font-size:12px; font-weight:850; letter-spacing:.06em; }
  .control-status-open { border:1px solid #305c40; color:#97e3b0; background:rgba(29,92,51,.25); }
  .control-status-closed { border:1px solid #66562c; color:#e5cc82; background:rgba(105,82,20,.22); }
  .control-status-ready { border:1px solid #5d3b68; color:#dcb4ea; background:rgba(81,40,95,.25); }
  .control-status-in_progress { border:1px solid #6b3540; color:#f5a3ad; background:rgba(108,36,49,.28); }
  .control-status-completed { border:1px solid #45464c; color:#b7b8bd; background:rgba(69,70,76,.22); }
  .control-stats { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:12px; margin-bottom:18px; }
  .control-stat,.control-card { border:1px solid #2b2b2f; border-radius:15px; background:rgba(28,28,31,.94); box-shadow:0 15px 42px rgba(0,0,0,.18); }
  .control-stat { padding:18px; }
  .control-stat-label { margin:0; color:#87888e; font-size:10px; font-weight:850; letter-spacing:.06em; text-transform:uppercase; }
  .control-stat-value { margin:11px 0 5px; font-size:25px; font-weight:850; line-height:1; }
  .control-stat-note { margin:0; color:#66676d; font-size:11px; }
  .control-progress { margin-bottom:18px; padding:17px 19px; border:1px solid #2b2b2f; border-radius:14px; background:rgba(28,28,31,.94); }
  .control-progress-head { display:flex; justify-content:space-between; gap:15px; margin-bottom:10px; font-size:12px; font-weight:750; }
  .control-progress-track { height:10px; overflow:hidden; border-radius:999px; background:#111113; }
  .control-progress-fill { height:100%; border-radius:999px; background:linear-gradient(90deg,#942532,#df4859); }
  .control-message { margin-bottom:18px; padding:13px 15px; border-radius:10px; font-size:13px; }
  .control-message-error { border:1px solid #73313a; color:#ffabb3; background:rgba(106,28,39,.3); }
  .control-message-success { border:1px solid #305c40; color:#a7e8ba; background:rgba(29,92,51,.25); }
  .control-grid { display:grid; grid-template-columns:minmax(0,1.55fr) minmax(300px,.7fr); gap:18px; }
  .readiness-panel { margin-bottom:18px; }
  .readiness-head { display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid #35353a;padding-bottom:15px }
  .readiness-head h2 { margin:0;font-size:24px }
  .readiness-head>strong { padding:9px 12px;border:1px solid;font-size:12px;letter-spacing:.12em }
  .readiness-ready { color:#a7e8ba;border-color:#305c40!important;background:rgba(29,92,51,.25) }
  .readiness-required { color:#ffabb3;border-color:#73313a!important;background:rgba(106,28,39,.3) }
  .readiness-unchecked { margin:22px 0;color:#999aa0 }
  .readiness-counts { display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:18px 0 }
  .readiness-counts div { padding:12px;border:1px solid #35353a;background:#111113 }
  .readiness-counts dt { color:#87888e;font-size:9px;font-weight:850;text-transform:uppercase }
  .readiness-counts dd { margin:6px 0 0;font-size:18px;font-weight:900 }
  .readiness-groups { display:grid;gap:8px }
  .readiness-groups details { border:1px solid #35353a;background:#111113 }
  .readiness-groups summary { padding:11px 13px;cursor:pointer;font-size:11px;font-weight:900;letter-spacing:.08em }
  .readiness-groups summary span { float:right;color:#87888e }
  .readiness-groups ul { display:grid;gap:1px;margin:0;padding:0;list-style:none }
  .readiness-check { display:grid;grid-template-columns:25px 1fr auto;gap:10px;align-items:start;padding:11px 13px;border-top:1px solid #29292d }
  .readiness-check>span { display:grid;place-items:center;width:22px;height:22px;border:1px solid;border-radius:50%;font-weight:950 }
  .readiness-check strong { font-size:12px }.readiness-check p { margin:4px 0 0;color:#999aa0;font-size:11px;line-height:1.45 }.readiness-check small { color:#6f7076 }.readiness-check>b { font-size:9px;letter-spacing:.07em }
  .readiness-check-pass>span,.readiness-check-pass>b { color:#97e3b0 }.readiness-check-warning>span,.readiness-check-warning>b { color:#e5cc82 }.readiness-check-blocking>span,.readiness-check-blocking>b { color:#ff8996 }
  .readiness-actions { display:flex;flex-wrap:wrap;gap:9px;margin-top:16px }.readiness-repairs { margin-top:18px;padding-top:16px;border-top:1px solid #35353a }.readiness-repairs h3 { margin:0 0 5px;font-size:14px }.readiness-repairs>p { margin:0 0 12px;color:#87888e;font-size:11px }.readiness-repairs form { display:inline-block;margin:0 8px 8px 0 }
  .control-card { padding:22px; }
  .control-section-head { margin-bottom:18px; }
  .control-section-head h2 { margin:0 0 5px; font-size:19px; }
  .control-section-head p { margin:0; color:#77787e; font-size:13px; }
  .control-toolbar { display:flex; gap:11px; margin-bottom:17px; }
  .control-search { flex:1 1 auto; height:43px; padding:0 13px; border:1px solid #39393e; border-radius:10px; outline:none; color:white; background:#111113; font:inherit; }
  .control-search:focus { border-color:#d94b5b; box-shadow:0 0 0 3px rgba(217,75,91,.14); }
  .control-filters { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:18px; }
  .control-filter { padding:8px 11px; border:1px solid #38383d; border-radius:999px; color:#a8a9ae; background:#202023; cursor:pointer; font:inherit; font-size:12px; font-weight:750; }
  .control-filter-active { border-color:#be3b4a; color:#fff; background:#7f202c; }
  .control-list { display:grid; gap:11px; }
  .control-claim { padding:16px; border:1px solid #35353a; border-radius:12px; background:rgba(12,12,14,.46); }
  .control-claim-top { display:flex; align-items:flex-start; justify-content:space-between; gap:15px; }
  .control-claim-order { display:flex; align-items:flex-start; gap:12px; }
  .control-claim-number { display:grid; place-items:center; min-width:35px; height:35px; border:1px solid #4b2a2f; border-radius:9px; color:#ee7180; background:#27171a; font-size:11px; font-weight:850; }
  .control-claim h3 { margin:0 0 5px; font-size:14px; }
  .control-claim-meta { display:flex; flex-wrap:wrap; gap:5px 12px; margin:0; color:#77787e; font-size:12px; }
  .control-claim-comment { margin:12px 0 0 47px; color:#a5a6ab; font-size:12px; line-height:1.5; }
  .control-badge { padding:5px 8px; border-radius:999px; font-size:10px; font-weight:850; }
  .control-badge-pending { border:1px solid #66562c; color:#e5cc82; background:rgba(105,82,20,.22); }
  .control-badge-confirmed { border:1px solid #305c40; color:#97e3b0; background:rgba(29,92,51,.25); }
  .control-badge-canceled,.control-badge-expired { border:1px solid #5e3035; color:#df8b94; background:rgba(91,37,44,.25); }
  .control-claim-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:13px; }
  .control-name-editor { display:grid; gap:12px; margin-top:14px; padding:14px; border:1px solid #4b2a2f; border-radius:10px; background:#111114; }
  .control-name-editor dl { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin:0; }
  .control-name-editor dt { color:#77787e; font-size:10px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
  .control-name-editor dd { margin:3px 0 0; color:#dddde2; font-size:12px; }
  .control-name-editor-actions { display:flex; justify-content:flex-end; gap:8px; }
  .control-button { padding:10px 13px; border-radius:9px; cursor:pointer; font:inherit; font-size:12px; font-weight:850; }
  .control-button:disabled { cursor:wait; opacity:.55; }
  .control-button-primary { border:1px solid #ee5464; color:white; background:linear-gradient(180deg,#d94051,#9d2432); }
  .control-button-secondary { border:1px solid #3c3c41; color:#d7d7da; background:#222225; }
  .control-button-warning { border:1px solid #765122; color:#f1cd83; background:#392a16; }
  .control-button-danger { border:1px solid #b53c4b; color:#fff; background:#721f2a; }
  .control-button-full { width:100%; }
  .control-empty { padding:48px 20px; border:1px dashed #3a3a3f; border-radius:12px; color:#77787e; text-align:center; }
  .control-actions { display:grid; gap:10px; }
  .control-payment-status { padding:13px; border:1px solid #3a3a40; border-radius:10px; background:#151517; }
  .control-payment-status p { margin:0 0 5px; color:#898a90; font-size:10px; font-weight:850; letter-spacing:.08em; text-transform:uppercase; }
  .control-payment-status strong { display:block; margin-bottom:10px; }
  .control-copy-status { min-height:19px; margin:11px 0 0; color:#84d49d; font-size:12px; text-align:center; }
  .control-divider { height:1px; margin:21px 0; background:#303034; }
  .control-form { display:grid; gap:13px; }
  .control-field { display:grid; gap:6px; }
  .control-field label { font-size:12px; font-weight:750; }
  .control-input,.control-textarea { width:100%; border:1px solid #39393e; border-radius:9px; outline:none; color:white; background:#111113; font:inherit; }
  .control-input { height:42px; padding:0 11px; }
  .control-textarea { min-height:78px; padding:11px; resize:vertical; }
  .control-input:focus,.control-textarea:focus { border-color:#d94b5b; box-shadow:0 0 0 3px rgba(217,75,91,.14); }
  .control-lock-note { padding:13px; border:1px solid #4f4055; border-radius:10px; color:#cbb5d2; background:rgba(64,40,72,.22); font-size:12px; line-height:1.5; }
  .game-administration { margin-top:18px; }
  .game-danger-zone { margin-top:22px; padding:18px; border:2px solid #7a2833; border-radius:12px; background:rgba(90,25,35,.2); }
  .game-danger-zone h3 { margin:0 0 7px; color:#ff929e; }
  .game-danger-zone p { color:#c29ba0; line-height:1.55; }
  .game-danger-zone summary { margin-bottom:14px; cursor:pointer; font-weight:850; }
  @media (max-width:1000px) { .control-stats{grid-template-columns:repeat(3,minmax(0,1fr));}.control-grid{grid-template-columns:1fr;} }
  @media (max-width:700px) { .control-page{padding:18px;}.control-header{align-items:flex-start;flex-direction:column;}.control-stats{grid-template-columns:repeat(2,minmax(0,1fr));}.control-toolbar{flex-direction:column;} }
  @media (max-width:460px) { .control-page{padding:13px;}.control-card{padding:18px;}.control-stats{grid-template-columns:1fr;}.control-claim-top{flex-direction:column;}.control-claim-comment{margin-left:0;} }
`;

type FilterValue = "ALL" | "PENDING" | "CONFIRMED" | "CANCELED";

export default function GameControlCenter() {
  const actionData = useActionData<ActionData>();
  const navigate = useNavigate();
  const fetcher = useFetcher<ActionData>();
  const nameFetcher = useFetcher<ActionData>();
  const { game, claims, totals, publicUrl, results, paymentInstructionsConfigured, duplicated, secondChance, nameEditState, eligiblePrizeWheels, prizeClaims } = useLoaderData<typeof loader>();

  const [filter, setFilter] = useState<FilterValue>("ALL");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [editingClaimId, setEditingClaimId] = useState<string | null>(null);

  const isSubmitting = fetcher.state !== "idle";
  const isSavingName = nameFetcher.state !== "idle";
  const claimsLocked = ["READY", "IN_PROGRESS", "COMPLETED"].includes(game.status);
  const remaining = Math.max(game.totalSpots - totals.reservedQuantity, 0);
  const claimed = totals.reservedQuantity;
  const percentage = game.totalSpots > 0 ? Math.min(Math.round((claimed / game.totalSpots) * 100), 100) : 0;
  const confirmedRevenue = totals.confirmedQuantity * Number(game.pricePerSpot);

  useEffect(() => {
    if (nameFetcher.data?.intent === "edit-claim-name" && nameFetcher.data.success) {
      setEditingClaimId(null);
    }
  }, [nameFetcher.data]);

  const claimNumbers = useMemo(() => {
    const numbers = new Map<string, number>();
    claims.forEach((claim, index) => numbers.set(claim.id, index + 1));
    return numbers;
  }, [claims]);

  const filteredClaims = useMemo(() => {
    const term = search.trim().toLowerCase();
    return claims.filter((claim) => {
      const matchesFilter = filter === "ALL" || claim.status === filter;
      const matchesSearch = !term || claim.displayName.toLowerCase().includes(term) || claim.facebookHandle?.toLowerCase().includes(term);
      return matchesFilter && matchesSearch;
    });
  }, [claims, filter, search]);

  async function copyPublicLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this public claim link:", publicUrl);
    }
  }

  const wheelButtonLabel =
    game.status === "COMPLETED"
      ? "View Wheel Results"
      : game.status === "IN_PROGRESS"
        ? "Return to Live Wheels"
        : game.status === "READY"
          ? "Open Game Wheels"
          : "Begin Game / Open Wheels";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <main className="control-page">
        <div className="control-shell">
          <button className="control-back" type="button" onClick={() => navigate("/app")}>← Back to dashboard</button>

          <header className="control-header">
            <div>
              <p className="control-eyebrow">Game control center</p>
              <strong>{game.raffleCode}</strong>
              <h1>{game.title}</h1>
              <p className="control-description">{game.description ? renderGameInstructionVariables(game.description, { secondChanceNumber: game.secondChanceOffset }) : "Manage claims, payments, availability, and public access."}</p>
            </div>
            <span className={["control-status", `control-status-${game.status.toLowerCase()}`].join(" ")}>{game.status.replace("_", " ")}</span>
          </header>

          <section className="control-stats">
            <article className="control-stat"><p className="control-stat-label">Total spots</p><p className="control-stat-value">{game.totalSpots}</p><p className="control-stat-note">{formatCurrency(game.pricePerSpot)} each</p></article>
            <article className="control-stat"><p className="control-stat-label">Claimed</p><p className="control-stat-value">{claimed}</p><p className="control-stat-note">Pending and paid</p></article>
            <article className="control-stat"><p className="control-stat-label">Remaining</p><p className="control-stat-value">{remaining}</p><p className="control-stat-note">Available spots</p></article>
            <article className="control-stat"><p className="control-stat-label">Pending</p><p className="control-stat-value">{totals.pendingQuantity}</p><p className="control-stat-note">{totals.pendingClaims} claims</p></article>
            <article className="control-stat"><p className="control-stat-label">Confirmed</p><p className="control-stat-value">{totals.confirmedQuantity}</p><p className="control-stat-note">{formatCurrency(confirmedRevenue)} received</p></article>
            <article className="control-stat"><p className="control-stat-label">Wheels</p><p className="control-stat-value">{game.wheelCount + 1}</p><p className="control-stat-note">{game.wheelCount} name + 1 value</p></article>
          </section>

          <section className="control-progress">
            <div className="control-progress-head"><span>Game progress</span><span>{claimed} / {game.totalSpots} · {percentage}%</span></div>
            <div className="control-progress-track"><div className="control-progress-fill" style={{ width: `${percentage}%` }} /></div>
          </section>

          {game.archivedAt ? <div className="control-message control-message-error">Archived {formatDate(game.archivedAt)}. Gameplay and standard claim changes are disabled until restored.</div> : null}
          {duplicated ? <div className="control-message control-message-success">Game duplicated as {game.raffleCode}. This new copy is OPEN and contains setup only.</div> : null}
          {actionData?.error ? <div className="control-message control-message-error">{actionData.error}</div> : null}
          {actionData?.success ? <div className="control-message control-message-success">{actionData.success}</div> : null}

          <GameReadinessPanel gameStatus={game.status} archived={Boolean(game.archivedAt)} externalReport={actionData?.readiness ?? fetcher.data?.readiness} />

          {results ? (
            <GameResultsSummary
              results={results}
              heading={game.status === "COMPLETED" ? "Completed wheels" : "Wheel progress"}
              action={<a className="game-results-action" href={`/app/games/${game.id}/play#game-results`}>Open Game Results</a>}
            />
          ) : null}
          <SecondChanceSummary offset={game.secondChanceOffset} result={secondChance} />
          <GamePrizeClaims eligibleWheels={eligiblePrizeWheels} claims={prizeClaims} />

          {fetcher.data?.error ? <div className="control-message control-message-error">{fetcher.data.error}</div> : null}
          {fetcher.data?.success ? <div className="control-message control-message-success">{fetcher.data.success}</div> : null}
          {nameFetcher.data?.error ? <div className="control-message control-message-error">{nameFetcher.data.error}</div> : null}
          {nameFetcher.data?.success ? <div className="control-message control-message-success">{nameFetcher.data.success}</div> : null}

          <section className="control-grid">
            <article className="control-card">
              <div className="control-section-head"><h2>Claim queue</h2><p>Claims remain ordered by submission time.</p></div>
              <div className="control-toolbar"><input className="control-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or Facebook username" /></div>
              <div className="control-filters">
                {[["ALL", "All"], ["PENDING", "Pending"], ["CONFIRMED", "Paid"], ["CANCELED", "Canceled"]].map(([value, label]) => (
                  <button className={["control-filter", filter === value ? "control-filter-active" : ""].join(" ")} key={value} type="button" onClick={() => setFilter(value as FilterValue)}>{label}</button>
                ))}
              </div>

              {claimsLocked ? <div className="control-lock-note">Claims are locked because the wheel snapshot has already been created. The wheel entries will not change.</div> : null}
              {!nameEditState.editable ? <div className="control-lock-note">Names are locked because wheel results have begun.</div> : null}
              <div style={{ height: 14 }} />

              {filteredClaims.length === 0 ? <div className="control-empty">No claims match this view.</div> : (
                <div className="control-list">
                  {filteredClaims.map((claim) => (
                    <div className="control-claim" key={claim.id}>
                      <div className="control-claim-top">
                        <div className="control-claim-order">
                          <span className="control-claim-number">#{claimNumbers.get(claim.id)}</span>
                          <div>
                            <h3>{claim.displayName}</h3>
                            <p className="control-claim-meta">
                              <span>{claim.quantity} {claim.quantity === 1 ? "spot" : "spots"}</span>
                              {claim.facebookHandle ? <span>{claim.facebookHandle}</span> : null}
                              <span>{formatDate(claim.createdAt)}</span>
                            </p>
                          </div>
                        </div>
                        <span className={["control-badge", `control-badge-${claim.status.toLowerCase()}`].join(" ")}>{claim.status === "CONFIRMED" ? "PAID" : claim.status}</span>
                      </div>

                      {claim.comment ? <p className="control-claim-comment">{claim.comment}</p> : null}

                      {editingClaimId === claim.id ? (
                        <nameFetcher.Form className="control-name-editor" method="post">
                          <input type="hidden" name="intent" value="edit-claim-name" />
                          <input type="hidden" name="claimId" value={claim.id} />
                          <dl>
                            <div><dt>Current display name</dt><dd>{claim.displayName}</dd></div>
                            <div><dt>Confirmed quantity</dt><dd>{claim.status === "CONFIRMED" ? claim.quantity : 0} spots</dd></div>
                            <div><dt>Game Mode started</dt><dd>{nameEditState.gameModeStarted ? "Yes" : "No"}</dd></div>
                            <div><dt>Any wheel spun</dt><dd>{nameEditState.resultsBegun ? "Yes" : "No"}</dd></div>
                          </dl>
                          <div className="control-field">
                            <label htmlFor={`claim-name-${claim.id}`}>New display name</label>
                            <input className="control-input" id={`claim-name-${claim.id}`} name="displayName" defaultValue={claim.displayName} maxLength={100} required />
                          </div>
                          <div className="control-name-editor-actions">
                            <button className="control-button control-button-secondary" type="button" onClick={() => setEditingClaimId(null)} disabled={isSavingName}>Cancel</button>
                            <button className="control-button control-button-primary" type="submit" disabled={isSavingName}>{isSavingName ? "Saving…" : "Save"}</button>
                          </div>
                        </nameFetcher.Form>
                      ) : (
                        <div className="control-claim-actions">
                          <button className="control-button control-button-secondary" type="button" onClick={() => setEditingClaimId(claim.id)} disabled={!nameEditState.editable || isSavingName}>Edit Name</button>
                        </div>
                      )}

                      {claim.status === "PENDING" && !claimsLocked ? (
                        <div className="control-claim-actions">
                          <fetcher.Form method="post"><input type="hidden" name="intent" value="cancel-claim" /><input type="hidden" name="claimId" value={claim.id} /><button className="control-button control-button-secondary" type="submit" disabled={isSubmitting}>Cancel</button></fetcher.Form>
                          <fetcher.Form method="post"><input type="hidden" name="intent" value="confirm-claim" /><input type="hidden" name="claimId" value={claim.id} /><button className="control-button control-button-primary" type="submit" disabled={isSubmitting}>Confirm payment</button></fetcher.Form>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </article>

            <aside className="control-card">
              <div className="control-section-head"><h2>Quick actions</h2><p>Manage the public game and wheel session.</p></div>
              <div className="control-actions">
                <div className="control-payment-status"><p>Payment instructions</p><strong>{paymentInstructionsConfigured ? "Configured" : "Not configured"}</strong><button className="control-button control-button-secondary control-button-full" type="button" onClick={() => navigate("/app/settings")}>Edit Payment Instructions</button></div>
                <fetcher.Form method="post"><button className="control-button control-button-primary control-button-full" type="submit" name="intent" value="open-wheels" disabled={isSubmitting}>{wheelButtonLabel}</button></fetcher.Form>
                {results ? <fetcher.Form method="post"><button className="control-button control-button-full" type="submit" name="intent" value="open-broadcast" disabled={isSubmitting}>OPEN BROADCAST MODE</button></fetcher.Form> : null}
                <button className="control-button control-button-secondary control-button-full" type="button" onClick={copyPublicLink}>Copy public claim link</button>
                <a className="control-button control-button-secondary control-button-full" href={`/app/backups/export?type=raffle-json&gameId=${encodeURIComponent(game.id)}`}>Export Raffle JSON</a>
                <a className="control-button control-button-secondary control-button-full" href={`/app/backups/export?type=claims-csv&gameId=${encodeURIComponent(game.id)}`}>Export Claims CSV</a>
                <a className="control-button control-button-secondary control-button-full" href={`/app/backups/export?type=winners-csv&gameId=${encodeURIComponent(game.id)}`}>Export Winners CSV</a>
                <fetcher.Form className="control-form" method="post">
                  <input type="hidden" name="intent" value="save-game-template" />
                  <div className="control-field"><label htmlFor="setupTemplateName">Template name</label><input className="control-input" id="setupTemplateName" name="templateName" maxLength={100} required placeholder="Reusable setup name" /></div>
                  <button className="control-button control-button-secondary control-button-full" type="submit" disabled={isSubmitting}>Save Game Setup as Template</button>
                </fetcher.Form>

                {game.status === "OPEN" ? (
                  <fetcher.Form method="post"><input type="hidden" name="intent" value="close-game" /><button className="control-button control-button-warning control-button-full" type="submit" disabled={isSubmitting}>Close game</button></fetcher.Form>
                ) : game.status === "CLOSED" ? (
                  <fetcher.Form method="post"><input type="hidden" name="intent" value="reopen-game" /><button className="control-button control-button-secondary control-button-full" type="submit" disabled={isSubmitting}>Reopen game</button></fetcher.Form>
                ) : null}
              </div>

              <p className="control-copy-status">{copied ? "Public link copied." : ""}</p>
              <div className="control-divider" />
              <div className="control-section-head"><h2>Add Facebook claim</h2><p>Enter claims submitted directly in your group.</p></div>

              {claimsLocked ? <div className="control-lock-note">New claims are disabled after Game Mode begins.</div> : (
                <fetcher.Form className="control-form" method="post">
                  <input type="hidden" name="intent" value="create-claim" />
                  <div className="control-field"><label htmlFor="displayName">Facebook display name</label><input className="control-input" id="displayName" name="displayName" type="text" required disabled={isSubmitting || game.status !== "OPEN" || remaining === 0} /></div>
                  <div className="control-field"><label htmlFor="facebookHandle">Facebook username</label><input className="control-input" id="facebookHandle" name="facebookHandle" type="text" placeholder="@username" disabled={isSubmitting || game.status !== "OPEN" || remaining === 0} /></div>
                  <div className="control-field"><label htmlFor="quantity">Number of spots</label><input className="control-input" id="quantity" name="quantity" type="number" min="1" max={remaining} required disabled={isSubmitting || game.status !== "OPEN" || remaining === 0} /></div>
                  <div className="control-field"><label htmlFor="comment">Member comment</label><textarea className="control-textarea" id="comment" name="comment" disabled={isSubmitting || game.status !== "OPEN" || remaining === 0} /></div>
                  <button className="control-button control-button-primary control-button-full" type="submit" disabled={isSubmitting || game.status !== "OPEN" || remaining === 0}>{isSubmitting ? "Saving…" : game.status !== "OPEN" ? "Game closed" : remaining === 0 ? "Game full" : "Add pending claim"}</button>
                </fetcher.Form>
              )}
            </aside>
          </section>
          <GameAdministration game={game} />
        </div>
      </main>
    </>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let message = "The game could not be loaded.";

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "This game could not be found." : `${error.status}: ${error.statusText}`;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <main style={{ minHeight: "100vh", padding: 32, color: "#ffffff", background: "#101012" }}>
      <h1>Game error</h1>
      <p>{message}</p>
      <a href="/app">Return to dashboard</a>
    </main>
  );
}
