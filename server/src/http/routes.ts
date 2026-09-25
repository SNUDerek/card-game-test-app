import type { Application } from "express";
import type { CardCatalogResponse } from "@card-table/shared";
import type { CardCatalog } from "../cards/load-card-catalog.js";

export function registerCardRoutes(app: Application, catalog: CardCatalog): void {
  app.get("/api/cards", (_req, res) => {
    const body: CardCatalogResponse = { cards: [...catalog.values()] };
    res.json(body);
  });
}
