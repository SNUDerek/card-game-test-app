import { lazy, Suspense } from "react";
import { Redirect, Route, Router, Switch } from "wouter";
import { CardCatalogProvider } from "./features/card-browser/CardCatalogContext";
import { Lobby } from "./features/lobby/Lobby";
import { MultiplayerProvider, useMultiplayer } from "./multiplayer/MultiplayerContext";
import { AuthProvider, useCurrentUser } from "./features/auth/AuthContext";
import { AuthScreen } from "./features/auth/AuthScreen";

function Session() {
  const { status } = useMultiplayer();

  if (status !== "connected") return <Lobby />;

  return <LazyRoomTable />;
}

const LazyRoomTable = lazy(() => import("./features/room/RoomScreen"));
const SetListScreen = lazy(() => import("./features/sets/SetListScreen"));
const SetScreen = lazy(() => import("./features/sets/SetScreen"));

function RoomScreen() {
  return <Session />;
}

function LegacyRoomRedirect({ params }: { params: { id: string } }) {
  return <Redirect to={`/rooms/${params.id}`} replace />;
}

function AuthenticatedApp() {
  const { status } = useCurrentUser();
  if (status === "loading") return <main className="auth-screen" aria-label="Loading" />;
  if (status === "anonymous") return <AuthScreen />;
  return (
    <CardCatalogProvider>
      <MultiplayerProvider>
        <Suspense fallback={<main aria-label="Loading page" />}>
          <Switch>
            <Route path="/" component={Session} />
            <Route path="/rooms/:id" component={RoomScreen} />
            <Route path="/room/:id" component={LegacyRoomRedirect} />
            <Route path="/sets" component={SetListScreen} />
            <Route path="/sets/:id" component={SetScreen} />
            <Route><Redirect to="/" replace /></Route>
          </Switch>
        </Suspense>
      </MultiplayerProvider>
    </CardCatalogProvider>
  );
}

export function App() {
  return <Router><AuthProvider><AuthenticatedApp /></AuthProvider></Router>;
}
