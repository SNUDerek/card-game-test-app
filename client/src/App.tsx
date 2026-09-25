import { CardBrowser } from "./features/card-browser/CardBrowser";
import { CardCatalogProvider } from "./features/card-browser/CardCatalogContext";
import { MultiplayerProvider } from "./multiplayer/MultiplayerContext";
import { Table } from "./tabletop/Table";

export function App() {
  return (
    <CardCatalogProvider>
      <MultiplayerProvider>
        <Table />
        <CardBrowser />
      </MultiplayerProvider>
    </CardCatalogProvider>
  );
}
