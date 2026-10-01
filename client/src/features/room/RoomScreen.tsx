import { CardBrowser } from "../card-browser/CardBrowser";
import { RoomHud } from "./RoomHud";
import { Table } from "../../tabletop/Table";

export default function RoomScreen() {
  return (
    <>
      <Table />
      <RoomHud />
      <CardBrowser />
    </>
  );
}
