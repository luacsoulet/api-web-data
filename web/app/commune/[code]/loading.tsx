export default function Loading() {
  return (
    <main aria-busy="true">
      <p className="source">Chargement de la commune…</p>
      <div className="sq sq-titre" />
      <div className="panel filtres sq" />
      <section className="kpis">
        <div className="panel sq" />
        <div className="panel sq" />
        <div className="panel sq" />
      </section>
      <div className="panel carte-panneau">
        <div className="carte sq" />
      </div>
      <div className="panel graphique sq-grand" />
    </main>
  );
}
