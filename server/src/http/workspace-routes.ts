import type { Application, Request, RequestHandler, Response } from "express";
import express from "express";
import {
  CreateCardRequestSchema, CreateCardSetRequestSchema, DuplicateDeckRequestSchema,
  ForkCardSetRequestSchema, GenerateDeckRequestSchema, SaveDeckRequestSchema,
  UpdateCardRequestSchema, UpdateCardSetRequestSchema, UpdateDeckRequestSchema,
} from "@card-table/shared";
import { z } from "zod";
import type { AuthenticatedRequest } from "../auth/middleware.js";
import { buildSetExportArchive, setExportFileName } from "../library/export-set.js";
import { DeckGenerationError, generateDeck } from "../library/generate-deck.js";
import type { ImageStore } from "../library/image-store.js";
import type { LibraryCard } from "@card-table/shared";
import type { WorkspaceService } from "../library/workspace-service.js";
import { inspectCardImage } from "../library/image-store.js";
import { HttpError } from "./errors.js";

const IdParams = z.object({ id: z.string().uuid() });
const ImageParams = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/) });
const SetParams = z.object({ setId: z.string().uuid() });

function asyncRoute(handler: (req: Request, res: Response) => void | Promise<void>): RequestHandler {
  return (req, res, next) => { Promise.resolve(handler(req, res)).catch(next); };
}

function parse<Schema extends z.ZodType>(schema: Schema, value: unknown): z.infer<Schema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, "Invalid request.");
  return parsed.data;
}

function userId(req: Request): string {
  return (req as AuthenticatedRequest).user.id;
}

const cardResponse = (card: LibraryCard) => ({ ...card, imageUrl: `/images/${card.imageId}` });

export function registerWorkspaceRoutes(
  app: Application,
  repository: WorkspaceService,
  images: ImageStore,
): void {
  const json = express.json({ type: "application/json", limit: "64kb" });

  app.get("/api/sets", (req, res) => {
    res.json({ sets: repository.listSets(req.query.archived === "true") });
  });
  app.post("/api/sets", json, (req, res) => {
    res.status(201).json({ set: repository.createSet(parse(CreateCardSetRequestSchema, req.body), userId(req)) });
  });
  app.get("/api/sets/:id", (req, res) => {
    const set = repository.sets.require(parse(IdParams, req.params).id);
    if (set.archived && req.query.archived !== "true") throw new HttpError(404, "Set not found.");
    res.json({ set });
  });
  app.patch("/api/sets/:id", json, (req, res) => {
    res.json({ set: repository.updateSet(parse(IdParams, req.params).id, parse(UpdateCardSetRequestSchema, req.body), userId(req)) });
  });
  app.delete("/api/sets/:id", (req, res) => {
    repository.archiveSet(parse(IdParams, req.params).id);
    res.status(204).end();
  });
  app.post("/api/sets/:id/fork", json, (req, res) => {
    const { id } = parse(IdParams, req.params);
    const { name } = parse(ForkCardSetRequestSchema, req.body);
    const set = repository.forkSet(id, name, userId(req));
    res.status(201).json({ set: repository.setSummary(set.id) });
  });

  app.get("/api/sets/:setId/cards", (req, res) => {
    res.json({ cards: repository.listCards(parse(SetParams, req.params).setId, req.query.archived === "true").map(cardResponse) });
  });
  app.post("/api/sets/:setId/cards", json, (req, res) => {
    const { setId } = parse(SetParams, req.params);
    res.status(201).json({ card: cardResponse(repository.createCard(setId, parse(CreateCardRequestSchema, req.body), userId(req))) });
  });
  app.put("/api/cards/:id", json, (req, res) => {
    res.json({ card: cardResponse(repository.updateCard(parse(IdParams, req.params).id, parse(UpdateCardRequestSchema, req.body), userId(req))) });
  });
  app.delete("/api/cards/:id", (req, res) => {
    repository.archiveCard(parse(IdParams, req.params).id, userId(req));
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
    res.status(201).json({ deck: repository.createDeck(setId, parse(SaveDeckRequestSchema, req.body), userId(req)) });
  });
  app.put("/api/decks/:id", json, (req, res) => {
    res.json({ deck: repository.updateDeck(parse(IdParams, req.params).id, parse(UpdateDeckRequestSchema, req.body), userId(req)) });
  });
  app.delete("/api/decks/:id", (req, res) => {
    repository.deleteDeck(parse(IdParams, req.params).id);
    res.status(204).end();
  });
  app.post("/api/decks/:id/duplicate", json, (req, res) => {
    const { name } = parse(DuplicateDeckRequestSchema, req.body ?? {});
    res.status(201).json({ deck: repository.duplicateDeck(parse(IdParams, req.params).id, name, userId(req)) });
  });
  app.post("/api/sets/:setId/decks/generate", json, (req, res) => {
    const cards = repository.listCards(parse(SetParams, req.params).setId);
    const { params } = parse(GenerateDeckRequestSchema, req.body);
    try { res.json(generateDeck(cards, params)); }
    catch (error) {
      if (error instanceof DeckGenerationError) throw new HttpError(400, error.message);
      throw error;
    }
  });

  app.get("/api/images", (_req, res) => res.json({ images: images.list() }));
  app.post("/api/images", express.raw({ type: ["image/png", "image/jpeg"], limit: "2mb" }), (req, res) => {
    if (!Buffer.isBuffer(req.body)) throw new HttpError(415, "An image Content-Type is required.");
    const inspected = inspectCardImage(req.body);
    const declared = req.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
    if (declared !== inspected.mime) throw new HttpError(400, "Image bytes do not match the Content-Type.");
    const image = images.save(req.body, userId(req));
    res.status(201).json({ image: { ...image, imageUrl: `/images/${image.id}` } });
  });
  app.get("/images/:id", (req, res) => {
    const image = images.find(parse(ImageParams, req.params).id);
    if (!image) throw new HttpError(404, "Image not found.");
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.type(image.mime).sendFile(images.filePath(image.id, image.mime));
  });

  app.get("/api/sets/:id/export", asyncRoute(async (req, res) => {
    const snapshot = repository.exportSnapshot(parse(IdParams, req.params).id);
    const exportedAt = new Date();
    const archive = buildSetExportArchive(snapshot, (imageId) => {
      return images.read(imageId);
    }, exportedAt);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${setExportFileName(snapshot.set.name, exportedAt)}"`);
    res.send(Buffer.from(archive));
  }));

}
