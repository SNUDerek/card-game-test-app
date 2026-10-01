import path from "node:path";
import { CardCatalogError, loadCardSources } from "../cards/load-card-catalog.js";
import { DATABASE_FILE, IMAGES_DIR } from "../config/env.js";
import { openDatabase } from "../db/connection.js";
import { ImageRepository } from "../db/images.js";
import { ImageStore } from "./image-store.js";
import { importCardSet } from "./import-cards.js";

// npm run cards:import -w server -- ./cards "Set name"
const [cardsDir, setName] = process.argv.slice(2);
if (!cardsDir || !setName?.trim()) {
  console.error('Usage: npm run cards:import -w server -- <cards folder> "<set name>"');
  process.exit(1);
}

let sources;
try {
  // npm runs workspace scripts from server/, so resolve against where it was invoked.
  sources = await loadCardSources(path.resolve(process.env.INIT_CWD ?? process.cwd(), cardsDir));
} catch (err) {
  if (err instanceof CardCatalogError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

const database = openDatabase(DATABASE_FILE);
try {
  const imageStore = new ImageStore(new ImageRepository(database), IMAGES_DIR);
  const { set, cardCount } = importCardSet(database, imageStore, sources, setName.trim());
  console.log(`Imported ${cardCount} cards into new set "${set.name}" (${set.id}).`);
} finally {
  database.close();
}
