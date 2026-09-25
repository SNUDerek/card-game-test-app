import { CardBrowser } from "./features/card-browser/CardBrowser";
import { CardCatalogProvider } from "./features/card-browser/CardCatalogContext";
import { Lobby } from "./features/lobby/Lobby";
import { RoomHud } from "./features/room/RoomHud";
import { MultiplayerProvider, useMultiplayer } from "./multiplayer/MultiplayerContext";
import { Table } from "./tabletop/Table";

function Session() {
  const { status } = useMultiplayer();

  if (status !== "connected") return <Lobby />;

  return (
    <>
      <Table />
      <RoomHud />
      <CardBrowser />
    </>
  );
}

export function App() {
  return (
    <CardCatalogProvider>
      <MultiplayerProvider>
        <Session />
      </MultiplayerProvider>
    </CardCatalogProvider>
  );
}
