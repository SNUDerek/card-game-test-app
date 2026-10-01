import fs from "node:fs";
import type { Application, NextFunction, Request, RequestHandler, Response } from "express";
import express from "express";
import {
  CreateCardSchema, CreateDeckSchema, CreateSetSchema, DuplicateDeckSchema, ForkSetSchema,
  GenerateDeckRequestSchema, UpdateCardSchema, UpdateDeckSchema, UpdateSetSchema,
} from "@card-table/shared";
import { z } from "zod";
import type { AuthenticatedRequest } from "../auth/middleware.js";
import { buildSetExportArchive, setExportFileName } from "../library/export-set.js";
import { DeckGenerationError, generateDeck } from "../library/generate-deck.js";
import type { ImageStore } from "../library/image-store.js";
import { WorkspaceError, type WorkspaceRepository } from "../library/workspace-repository.js";

const IdParams = z.object({ id: z.string().uuid() });
const ImageParams = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/) });
const SetParams = z.object({ setId: z.string().uuid() });

function asyncRoute(handler: (req: Request, res: Response) => void | Promise<void>): RequestHandler {
  return (req, res, next) => { Promise.resolve(handler(req, res)).catch(next); };
}

function parse<Schema extends z.ZodType>(schema: Schema, value: unknown): z.infer<Schema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new WorkspaceError(400, "Invalid request.");
  return parsed.data;
}

function userId(req: Request): string {
  return (req as AuthenticatedRequest).user.id;
}

export function registerWorkspaceRoutes(
  app: Application,
  repository: WorkspaceRepository,
  images: ImageStore,
): void {
  const json = express.json({ type: "application/json", limit: "64kb" });

  app.get("/api/sets", (req, res) => {
    res.json({ sets: repository.listSets(req.query.archived === "true") });
  });
  app.post("/api/sets", json, (req, res) => {
    res.status(201).json({ set: repository.createSet(parse(CreateSetSchema, req.body), userId(req)) });
  });
  app.get("/api/sets/:id", (req, res) => {
    res.json({ set: repository.getSet(parse(IdParams, req.params).id, req.query.archived === "true") });
  });
  app.patch("/api/sets/:id", json, (req, res) => {
    res.json({ set: repository.updateSet(parse(IdParams, req.params).id, parse(UpdateSetSchema, req.body)) });
  });
  app.delete("/api/sets/:id", (req, res) => {
    repository.archiveSet(parse(IdParams, req.params).id);
    res.status(204).end();
  });
  app.post("/api/sets/:id/fork", json, (req, res) => {
    const { id } = parse(IdParams, req.params);
    const { name } = parse(ForkSetSchema, req.body);
    res.status(201).json({ set: repository.forkSet(id, name, userId(req)) });
  });

  app.get("/api/sets/:setId/cards", (req, res) => {
    res.json({ cards: repository.listCards(parse(SetParams, req.params).setId, req.query.archived === "true") });
  });
  app.post("/api/sets/:setId/cards", json, (req, res) => {
    const { setId } = parse(SetParams, req.params);
    res.status(201).json({ card: repository.createCard(setId, parse(CreateCardSchema, req.body), userId(req)) });
  });
  app.put("/api/cards/:id", json, (req, res) => {
    res.json({ card: repository.updateCard(parse(IdParams, req.params).id, parse(UpdateCardSchema, req.body), userId(req)) });
  });
  app.delete("/api/cards/:id", (req, res) => {
    repository.archiveCard(parse(IdParams, req.params).id);
    res.status(204).end();
  });

  app.get("/api/sets/:setId/decks", (req, res) => {
    res.json({ decks: repository.listDecks(parse(SetParams, req.params).setId) });
  });
  app.get("/api/decks/:id", (req, res) => {
    res.json({ deck: repository.getDeck(parse(IdParams, req.params).id) });
  });
  app.post("/api/sets/:setId/decks", json, (req, res) => {
    const { setId } = parse(SetParams, req.params);
    res.status(201).json({ deck: repository.createDeck(setId, parse(CreateDeckSchema, req.body), userId(req)) });
  });
  app.put("/api/decks/:id", json, (req, res) => {
    res.json({ deck: repository.updateDeck(parse(IdParams, req.params).id, parse(UpdateDeckSchema, req.body), userId(req)) });
  });
  app.delete("/api/decks/:id", (req, res) => {
    repository.deleteDeck(parse(IdParams, req.params).id);
    res.status(204).end();
  });
  app.post("/api/decks/:id/duplicate", json, (req, res) => {
    const { name } = parse(DuplicateDeckSchema, req.body ?? {});
    res.status(201).json({ deck: repository.duplicateDeck(parse(IdParams, req.params).id, name, userId(req)) });
  });
  app.post("/api/sets/:setId/decks/generate", json, (req, res) => {
    const cards = repository.listCards(parse(SetParams, req.params).setId);
    const { params } = parse(GenerateDeckRequestSchema, req.body);
    try { res.json(generateDeck(cards, params)); }
    catch (error) {
      if (error instanceof DeckGenerationError) throw new WorkspaceError(400, error.message);
      throw error;
    }
  });

  app.get("/api/images", (_req, res) => res.json({ images: images.list() }));
  app.post("/api/images", express.raw({ type: ["image/png", "image/jpeg"], limit: "2mb" }), (req, res) => {
    if (!Buffer.isBuffer(req.body)) throw new WorkspaceError(415, "An image Content-Type is required.");
    res.status(201).json({ image: images.upload(req.body, req.headers["content-type"] ?? "", userId(req)) });
  });
  app.get("/images/:id", (req, res) => {
    const image = images.get(parse(ImageParams, req.params).id);
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.type(image.mime).sendFile(images.filePath(image));
  });

  app.get("/api/sets/:id/export", asyncRoute(async (req, res) => {
    const snapshot = repository.exportSnapshot(parse(IdParams, req.params).id);
    const exportedAt = new Date();
    const archive = buildSetExportArchive(snapshot, (imageId) => {
      const image = images.get(imageId);
      return fs.readFileSync(images.filePath(image));
    }, exportedAt);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${setExportFileName(snapshot.set.name, exportedAt)}"`);
    res.send(Buffer.from(archive));
  }));

}

export function workspaceErrorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!(error instanceof WorkspaceError)) { next(error); return; }
  res.status(error.status).json({ error: error.message });
}
