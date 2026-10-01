import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  CardSetSchema,
  DESCRIPTION_MAX_LENGTH,
  SET_NAME_MAX_LENGTH,
  SetCardsResponseSchema,
  type CardDefinition,
  type CardSet,
} from "@card-table/shared";
import { z } from "zod";
import { ApiConflictError, apiRequest } from "../../api/client";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { CardEditor } from "./cards/CardEditor";
import { CardList } from "./cards/CardList";
import { errorMessage } from "./errors";
import "./workspace.css";

const SetResponseSchema = z.object({ set: CardSetSchema });
const ForkResponseSchema = z.object({ set: z.object({ id: z.string() }) });

/** `undefined` while no editor is open; `null` while creating a new card. */
type EditingCard = CardDefinition | null | undefined;

export default function SetScreen({ params }: { params: { id: string } }) {
  const [, navigate] = useLocation();
  const [set, setSet] = useState<CardSet | null>(null);
  const [cards, setCards] = useState<CardDefinition[]>([]);
  const [editing, setEditing] = useState<EditingCard>(undefined);
  const [nameDraft, setNameDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [dialog, setDialog] = useState<"fork" | "archive" | null>(null);
  const [forkName, setForkName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [inUse, setInUse] = useState(false);

  const load = useCallback(async () => {
    try {
      const [setBody, cardsBody] = await Promise.all([
        apiRequest(`/api/sets/${params.id}`, SetResponseSchema),
        apiRequest(`/api/sets/${params.id}/cards`, SetCardsResponseSchema),
      ]);
      setSet(setBody.set);
      setNameDraft(setBody.set.name);
      setDescriptionDraft(setBody.set.description);
      setCards(cardsBody.cards);
      setError(null);
    } catch (cause: unknown) {
      setError(errorMessage(cause, "Could not load set."));
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!set) {
    return (
      <main className="workspace-page">
        <Link href="/sets">← Sets</Link>
        {error ? <p className="workspace-error" role="alert">{error}</p> : <p>Loading set…</p>}
      </main>
    );
  }
  const current = set;

  async function saveDetails() {
    try {
      const body = await apiRequest(`/api/sets/${current.id}`, SetResponseSchema, {
        method: "PATCH",
        body: JSON.stringify({
          name: nameDraft,
          description: descriptionDraft,
          revision: current.revision,
        }),
      });
      setSet(body.set);
      setError(null);
    } catch (cause: unknown) {
      setError(
        cause instanceof ApiConflictError
          ? "This set changed elsewhere. Your draft is still here; reload before saving again."
          : errorMessage(cause, "Could not save set."),
      );
    }
  }

  function openFork() {
    setForkName(`${current.name} copy`);
    setDialog("fork");
  }

  async function fork() {
    setDialog(null);
    try {
      const body = await apiRequest(`/api/sets/${current.id}/fork`, ForkResponseSchema, {
        method: "POST",
        body: JSON.stringify({ name: forkName }),
      });
      navigate(`/sets/${body.set.id}`);
    } catch (cause: unknown) {
      setError(errorMessage(cause, "Could not fork set."));
    }
  }

  async function archive() {
    setDialog(null);
    try {
      await apiRequest(`/api/sets/${current.id}`, z.undefined(), { method: "DELETE" });
      navigate("/sets");
    } catch (cause: unknown) {
      setInUse(cause instanceof ApiConflictError);
      setError(errorMessage(cause, "Could not archive set."));
    }
  }

  return (
    <main className="workspace-page">
      <header className="workspace-header">
        <div>
          <Link href="/sets">← Card sets</Link>
          <h1>{set.name}</h1>
        </div>
        <div className="workspace-actions">
          <button type="button" onClick={openFork}>Fork</button>
          <a href={`/api/sets/${set.id}/export`}>Export</a>
          <button type="button" className="danger" onClick={() => setDialog("archive")}>Archive</button>
        </div>
      </header>

      <section className="set-details">
        <label>
          Name
          <input value={nameDraft} maxLength={SET_NAME_MAX_LENGTH}
            onChange={(event) => setNameDraft(event.target.value)} />
        </label>
        <label>
          Description
          <input value={descriptionDraft} maxLength={DESCRIPTION_MAX_LENGTH}
            onChange={(event) => setDescriptionDraft(event.target.value)} />
        </label>
        <button type="button" disabled={!nameDraft.trim()} onClick={() => void saveDetails()}>
          Save details
        </button>
      </section>

      {error && <p className="workspace-error" role="alert">{error}</p>}
      {inUse && (
        <aside className="workspace-notice">
          This set is in use by an open room. End that room from the room browser, or{" "}
          <button type="button" onClick={openFork}>fork this set</button> to continue editing safely.
        </aside>
      )}

      <nav className="set-tabs" aria-label="Set sections">
        <button type="button" className="active">Cards</button>
      </nav>
      <CardList cards={cards} onEdit={setEditing} onNew={() => setEditing(null)} />

      {editing !== undefined && (
        <CardEditor
          setId={set.id}
          card={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void load();
          }}
        />
      )}
      {dialog === "fork" && (
        <ConfirmDialog
          title={`Fork "${set.name}"`}
          onCancel={() => setDialog(null)}
          actions={[{
            label: "Fork",
            tone: "primary",
            disabled: !forkName.trim(),
            onClick: () => void fork(),
          }]}
        >
          <label>
            Name for the fork
            <input value={forkName} maxLength={SET_NAME_MAX_LENGTH}
              onChange={(event) => setForkName(event.target.value)} />
          </label>
        </ConfirmDialog>
      )}
      {dialog === "archive" && (
        <ConfirmDialog
          title={`Archive "${set.name}"?`}
          onCancel={() => setDialog(null)}
          actions={[{ label: "Archive", tone: "danger", onClick: () => void archive() }]}
        >
          Its cards and decks are kept, and you can unarchive it from the set list.
        </ConfirmDialog>
      )}
    </main>
  );
}
