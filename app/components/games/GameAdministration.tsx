import { Form, useNavigation } from "react-router";

type GameAdministrationProps = {
  game: {
    title: string;
    status: string;
    archivedAt: string | null;
  };
};

export function GameAdministration({ game }: GameAdministrationProps) {
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";
  return (
    <section className="control-card game-administration" aria-labelledby="game-administration-heading">
      <div className="control-section-head">
        <h2 id="game-administration-heading">Game Administration</h2>
        <p>Archive, restore, or copy this game without changing its saved setup.</p>
      </div>
      <div className="control-actions">
        <Form method="post"><input type="hidden" name="intent" value="duplicate-game" /><button className="control-button control-button-secondary control-button-full" type="submit" disabled={busy}>Duplicate Game</button></Form>
        {game.archivedAt ? (
          <Form method="post"><input type="hidden" name="intent" value="restore-game" /><button className="control-button control-button-primary control-button-full" type="submit" disabled={busy}>Restore Game</button></Form>
        ) : (
          <Form method="post" onSubmit={(event) => { if (!window.confirm(`Archive ${game.title}? Claims and gameplay actions will be disabled until it is restored.`)) event.preventDefault(); }}><input type="hidden" name="intent" value="archive-game" /><button className="control-button control-button-warning control-button-full" type="submit" disabled={busy}>Archive Game</button></Form>
        )}
      </div>

      {game.archivedAt ? (
        <div className="game-danger-zone">
          <h3>Danger Zone</h3>
          <p>Permanently deleting this game removes its claims, payment status, wheel history, winners, and results. This cannot be undone.</p>
          <details>
            <summary>Permanent Delete</summary>
            <Form className="control-form" method="post">
              <input type="hidden" name="intent" value="delete-game" />
              <label htmlFor="deleteConfirmation">Type the exact game title or DELETE</label>
              <input className="control-input" id="deleteConfirmation" name="deleteConfirmation" required autoComplete="off" />
              <button className="control-button control-button-danger control-button-full" type="submit" disabled={busy}>Permanently Delete “{game.title}”</button>
            </Form>
          </details>
        </div>
      ) : null}
    </section>
  );
}
