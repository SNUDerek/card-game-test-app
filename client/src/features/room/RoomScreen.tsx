import { CardBrowser } from "../card-browser/CardBrowser";
import { CardCatalogProvider } from "../card-browser/CardCatalogContext";
import { CatalogNoticeToast } from "../card-browser/CatalogNoticeToast";
import { useMultiplayer } from "../../multiplayer/MultiplayerContext";
import { RoomHud } from "./RoomHud";
import { RoomIdleBanner } from "./RoomIdleBanner";
import { Table } from "../../tabletop/Table";

export default function RoomScreen() {
  const { setId, subscribeCatalogChanges } = useMultiplayer();

  return (
    <CardCatalogProvider setId={setId} subscribeToChanges={subscribeCatalogChanges}>
      <Table />
      <RoomHud />
      <RoomIdleBanner />
      <CardBrowser />
      <CatalogNoticeToast />
    </CardCatalogProvider>
  );
}
