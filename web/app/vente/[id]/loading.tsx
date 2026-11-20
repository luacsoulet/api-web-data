export default function Loading() {
  return (
    <main aria-busy="true">
      <p className="source">Chargement de la fiche…</p>
      <div className="sq-titre sq" />
      <div className="fiche">
        <div className="panel sq-grand" />
        <div className="panel sq" />
        <div className="panel sq" />
        <div className="panel sq" />
      </div>
    </main>
  );
}
