import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { CardSetSummarySchema, type CardSetSummary } from "@card-table/shared";
import { z } from "zod";
import { ApiConflictError, apiRequest } from "../../api/client";
import "./workspace.css";

export default function SetListScreen() {
  const [, navigate] = useLocation();
  const [sets, setSets] = useState<CardSetSummary[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(includeArchived = showArchived) {
    try {
      const body = await apiRequest(`/api/sets${includeArchived ? "?archived=true" : ""}`, z.object({ sets: z.array(CardSetSummarySchema) }));
      setSets(body.sets); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load sets."); }
  }
  useEffect(() => { void load(); }, [showArchived]); // eslint-disable-line react-hooks/exhaustive-deps
  async function create(event: FormEvent) {
    event.preventDefault(); if (!name.trim()) return; setBusy(true);
    try { const body = await apiRequest("/api/sets", z.object({ set: CardSetSummarySchema }), { method: "POST", body: JSON.stringify({ name, description }) }); navigate(`/sets/${body.set.id}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create set."); } finally { setBusy(false); }
  }
  async function archive(set: CardSetSummary) {
    if (!confirm(`Archive ${set.name}? Its cards and decks will be kept.`)) return;
    try { await apiRequest(`/api/sets/${set.id}`, z.undefined(), { method: "DELETE" }); await load(); }
    catch (cause) { setError(cause instanceof ApiConflictError ? `${cause.message} Fork the set to keep editing while its room stays open.` : cause instanceof Error ? cause.message : "Could not archive set."); }
  }
  async function restore(set: CardSetSummary) {
    try { await apiRequest(`/api/sets/${set.id}`, z.object({ set: CardSetSummarySchema }), { method: "PATCH", body: JSON.stringify({ revision: set.revision, archived: false }) }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not restore set."); }
  }
  return <main className="workspace-page">
    <header className="workspace-header"><div><Link href="/">← Rooms</Link><h1>Card sets</h1></div></header>
    <form className="workspace-create" onSubmit={create}><label>Name <input aria-label="New set name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></label><label>Description <input value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} /></label><button disabled={busy}>{busy ? "Creating…" : "Create set"}</button></form>
    <label className="workspace-check"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
    {error && <p className="workspace-error" role="alert">{error}</p>}
    <section className="set-list" aria-label="Card sets">{sets.map((set) => <article className="set-row" key={set.id}><div><Link href={`/sets/${set.id}`}>{set.name}</Link><p>{set.description || "No description"}</p><small>{set.cardCount} cards · {set.deckCount} decks{set.forkedFromSetName ? ` · Forked from ${set.forkedFromSetName}` : ""}</small></div>{set.archived ? <button onClick={() => void restore(set)}>Unarchive</button> : <button onClick={() => void archive(set)}>Archive</button>}</article>)}{sets.length === 0 && <p className="workspace-muted">No {showArchived ? "sets" : "active sets"} yet.</p>}</section>
  </main>;
}
