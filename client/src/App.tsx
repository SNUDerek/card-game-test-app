import { CardBrowser } from "./features/card-browser/CardBrowser";
import { CardCatalogProvider } from "./features/card-browser/CardCatalogContext";
import { Lobby } from "./features/lobby/Lobby";
import { RoomHud } from "./features/room/RoomHud";
import { MultiplayerProvider, useMultiplayer } from "./multiplayer/MultiplayerContext";
import { Table } from "./tabletop/Table";
import { AuthProvider, useCurrentUser } from "./features/auth/AuthContext";
import { AuthScreen } from "./features/auth/AuthScreen";

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

function AuthenticatedApp() {
  const { status } = useCurrentUser();
  if (status === "loading") return <main className="auth-screen" aria-label="Loading" />;
  if (status === "anonymous") return <AuthScreen />;
  return (
    <CardCatalogProvider>
      <MultiplayerProvider>
        <Session />
      </MultiplayerProvider>
    </CardCatalogProvider>
  );
}

export function App() {
  return <AuthProvider><AuthenticatedApp /></AuthProvider>;
}
