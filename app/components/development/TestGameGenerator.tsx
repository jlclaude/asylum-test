import { useFetcher } from "react-router";
import { formatRaffleCode } from "../../lib/raffle-number";
import { TEST_GAME_DELETE_CONFIRMATION } from "../../lib/test-game-generator";

type TestGameActionData = {
  ok: boolean;
  error?: string;
  message?: string;
  created?: {
    game: { id: string; title: string; raffleYear: number; raffleNumber: number; status: string };
    claimCount: number;
    paidSpotCount: number;
    initializationError: string | null;
    readiness: null | {
      isReady: boolean;
      blockingCount: number;
      warningCount: number;
      checks: Array<{ id: string; severity: string; title: string; message: string }>;
    };
  };
};

export function TestGameGenerator() {
  const fetcher = useFetcher<TestGameActionData>();
  const created = fetcher.data?.created;

  return (
    <section className="asylum-card test-game-tools" aria-labelledby="test-game-tools-title">
      <div className="asylum-section-heading">
        <div>
          <p className="asylum-eyebrow">Development tools</p>
          <h3 id="test-game-tools-title">Create Test Game</h3>
        </div>
        <span>Local development only</span>
      </div>
      <p className="test-game-tools__copy">
        Generate a shop-scoped deterministic raffle with fake claims. No winner is selected.
      </p>
      <fetcher.Form method="post" className="test-game-tools__form">
        <input type="hidden" name="intent" value="create-test-game" />
        <label>
          Test title
          <input name="title" defaultValue="Development Test Raffle" required />
        </label>
        <label>
          Total spots
          <input name="totalSpots" type="number" min={1} step={1} defaultValue={100} required />
        </label>
        <label>
          Price per spot
          <input name="pricePerSpot" type="number" min={0} step="0.01" defaultValue="10.00" required />
        </label>
        <label>
          Containments
          <input name="wheelCount" type="number" min={1} max={20} step={1} defaultValue={2} required />
        </label>
        <label>
          Claims
          <input name="claimCount" type="number" min={15} max={25} step={1} defaultValue={20} required />
        </label>
        <label className="test-game-tools__checkbox">
          <input name="includeDuplicateNames" type="checkbox" value="true" defaultChecked />
          Include duplicate names
        </label>
        <label>
          Payment state
          <select name="paymentMode" defaultValue="ALL_PAID">
            <option value="ALL_PAID">All paid</option>
            <option value="MIXED">Mixed statuses</option>
            <option value="PENDING">All pending</option>
          </select>
        </label>
        <label>
          Game state
          <select name="initialState" defaultValue="CLOSED">
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
            <option value="INITIALIZED">Initialized / Ready</option>
          </select>
        </label>
        <button className="asylum-primary-button" type="submit" disabled={fetcher.state !== "idle"}>
          {fetcher.state === "submitting" ? "Creating…" : "Create Test Game"}
        </button>
      </fetcher.Form>

      {fetcher.data?.error ? <p className="test-game-tools__error" role="alert">{fetcher.data.error}</p> : null}
      {fetcher.data?.message ? <p className="test-game-tools__success" role="status">{fetcher.data.message}</p> : null}
      {created ? (
        <div className="test-game-tools__result">
          <h4>{created.game.title}</h4>
          <p>{formatRaffleCode({ year: created.game.raffleYear, number: created.game.raffleNumber })} · {created.game.status} · {created.claimCount} claims · {created.paidSpotCount} paid spots</p>
          {created.readiness ? (
            <div>
              <p>Readiness: {created.readiness.isReady ? "Ready" : "Needs attention"} · {created.readiness.blockingCount} blocking · {created.readiness.warningCount} warnings</p>
              {created.readiness.checks.filter((check) => check.severity !== "PASS").length ? (
                <ul className="test-game-tools__issues">
                  {created.readiness.checks.filter((check) => check.severity !== "PASS").map((check) => (
                    <li key={check.id}><strong>{check.title}:</strong> {check.message}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : <p>Readiness runs automatically after closing or initializing.</p>}
          {created.initializationError ? <p className="test-game-tools__error">Initialization: {created.initializationError}</p> : null}
          <div className="test-game-tools__actions">
            <a href={`/app/games/${created.game.id}`}>Open Game Control Center</a>
            <a href={`/games/${created.game.id}`}>Open Public Claim Page</a>
            {created.readiness?.isReady ? <a href={`/app/games/${created.game.id}/play`}>Open Game Mode</a> : null}
          </div>
          <fetcher.Form method="post" className="test-game-tools__delete">
            <input type="hidden" name="intent" value="delete-test-game" />
            <input type="hidden" name="gameId" value={created.game.id} />
            <label>
              Type {TEST_GAME_DELETE_CONFIRMATION} to remove this fixture
              <input name="confirmation" autoComplete="off" required />
            </label>
            <button type="submit" disabled={fetcher.state !== "idle"}>Delete selected test game</button>
          </fetcher.Form>
        </div>
      ) : null}
    </section>
  );
}
