import { Link } from "wouter";

export default function SetScreen({ params }: { params: { id: string } }) {
  return (
    <main className="workspace-placeholder">
      <h1>Card set</h1>
      <p>Cards and decks for set <code>{params.id}</code> will appear here.</p>
      <nav aria-label="Set sections"><span>Cards</span> · <span>Decks</span></nav>
      <Link href="/sets">Back to sets</Link>
    </main>
  );
}
