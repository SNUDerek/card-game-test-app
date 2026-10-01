import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import {
  CardSetSchema,
  CardSetSummarySchema,
  DESCRIPTION_MAX_LENGTH,
  SET_NAME_MAX_LENGTH,
  type CardSetSummary,
} from "@card-table/shared";
import { z } from "zod";
import { ApiConflictError, apiRequest } from "../../api/client";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { errorMessage } from "./errors";
import "./workspace.css";

const SetListResponseSchema = z.object({ sets: z.array(CardSetSummarySchema) });
// Create and update return the bare set; only the list carries counts.
const SetResponseSchema = z.object({ set: CardSetSchema });

export default function SetListScreen() {
  const [, navigate] = useLocation();
  const [sets, setSets] = useState<CardSetSummary[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<CardSetSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const query = showArchived ? "?archived=true" : "";
      setSets((await apiRequest(`/api/sets${query}`, SetListResponseSchema)).sets);
      setError(null);
    } catch (cause: unknown) {
      setError(errorMessage(cause, "Could not load sets."));
    }
  }, [showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const body = await apiRequest("/api/sets", SetResponseSchema, {
        method: "POST",
        body: JSON.stringify({ name, description }),
      });
      navigate(`/sets/${body.set.id}`);
    } catch (cause: unknown) {
      setError(errorMessage(cause, "Could not create set."));
    } finally {
      setBusy(false);
    }
  }

  async function archive(set: CardSetSummary) {
    setPendingArchive(null);
    try {
      await apiRequest(`/api/sets/${set.id}`, z.undefined(), { method: "DELETE" });
      await load();
    } catch (cause: unknown) {
      setError(
        cause instanceof ApiConflictError
          ? `${cause.message} Fork the set to keep editing while its room stays open.`
          : errorMessage(cause, "Could not archive set."),
      );
    }
  }

  async function restore(set: CardSetSummary) {
    try {
      await apiRequest(`/api/sets/${set.id}`, SetResponseSchema, {
        method: "PATCH",
        body: JSON.stringify({ revision: set.revision, archived: false }),
      });
      await load();
    } catch (cause: unknown) {
      setError(errorMessage(cause, "Could not restore set."));
    }
  }

  return (
    <main className="workspace-page">
      <header className="workspace-header">
        <div>
          <Link href="/">← Rooms</Link>
          <h1>Card sets</h1>
        </div>
      </header>

      <form className="workspace-create" onSubmit={(event) => void create(event)}>
        <label>
          Name
          <input aria-label="New set name" value={name} maxLength={SET_NAME_MAX_LENGTH}
            onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Description
          <input value={description} maxLength={DESCRIPTION_MAX_LENGTH}
            onChange={(event) => setDescription(event.target.value)} />
        </label>
        <button type="submit" disabled={busy || !name.trim()}>
          {busy ? "Creating…" : "Create set"}
        </button>
      </form>

      <label className="workspace-check">
        <input type="checkbox" checked={showArchived}
          onChange={(event) => setShowArchived(event.target.checked)} />
        Show archived
      </label>
      {error && <p className="workspace-error" role="alert">{error}</p>}

      <section className="set-list" aria-label="Card sets">
        {sets.map((set) => (
          <article className="set-row" key={set.id}>
            <div>
              <Link href={`/sets/${set.id}`}>{set.name}</Link>
              <p>{set.description || "No description"}</p>
              <small>
                {set.cardCount} cards · {set.deckCount} decks
                {set.forkedFromSetName && ` · Forked from ${set.forkedFromSetName}`}
              </small>
            </div>
            {set.archived ? (
              <button type="button" onClick={() => void restore(set)}>Unarchive</button>
            ) : (
              <button type="button" onClick={() => setPendingArchive(set)}>Archive</button>
            )}
          </article>
        ))}
        {sets.length === 0 && (
          <p className="workspace-muted">No {showArchived ? "sets" : "active sets"} yet.</p>
        )}
      </section>

      {pendingArchive && (
        <ConfirmDialog
          title={`Archive "${pendingArchive.name}"?`}
          onCancel={() => setPendingArchive(null)}
          actions={[{ label: "Archive", tone: "danger", onClick: () => void archive(pendingArchive) }]}
        >
          Its cards and decks are kept, and you can unarchive it later.
        </ConfirmDialog>
      )}
    </main>
  );
}
