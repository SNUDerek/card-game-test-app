import type { Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { CardCatalogResponseSchema, type CardDefinition } from "@card-table/shared";
import type { CardCatalog } from "../cards/load-card-catalog.js";
import { registerCardRoutes } from "./routes.js";

function sampleCard(overrides: Partial<CardDefinition> = {}): CardDefinition {
  return {
    id: "item-red-potion",
    name: "Red Potion",
    type: "item",
    body: "Restores health.",
    imageUrl: "/cards/red_potion.png",
    sourceName: "red_potion",
    ...overrides,
  };
}

let server: Server | undefined;

async function startApp(catalog: CardCatalog): Promise<string> {
  const app = express();
  registerCardRoutes(app, catalog);
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server!.close((err) => (err ? reject(err) : resolve()));
  });
  server = undefined;
});

describe("GET /api/cards", () => {
  it("returns every card in the catalog, matching the shared response schema", async () => {
    const catalog: CardCatalog = new Map([
      ["item-red-potion", sampleCard()],
      [
        "creature-goblin",
        sampleCard({
          id: "creature-goblin",
          name: "Goblin",
          type: "creature",
          sourceName: "goblin",
          imageUrl: "/cards/goblin.png",
        }),
      ],
    ]);
    const baseUrl = await startApp(catalog);

    const res = await fetch(`${baseUrl}/api/cards`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(() => CardCatalogResponseSchema.parse(body)).not.toThrow();
    expect(body.cards).toHaveLength(2);
    expect(body.cards).toEqual(expect.arrayContaining([...catalog.values()]));
  });

  it("returns imageUrl pointing at the /cards static route", async () => {
    const catalog: CardCatalog = new Map([["item-red-potion", sampleCard()]]);
    const baseUrl = await startApp(catalog);

    const res = await fetch(`${baseUrl}/api/cards`);
    const body = await res.json();

    expect(body.cards[0].imageUrl).toBe("/cards/red_potion.png");
  });

  it("returns an empty list for an empty catalog", async () => {
    const baseUrl = await startApp(new Map());

    const res = await fetch(`${baseUrl}/api/cards`);
    const body = await res.json();

    expect(body).toEqual({ cards: [] });
  });
});
