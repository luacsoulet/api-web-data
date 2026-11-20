export default function Loading() {
  return (
    <main aria-busy="true">
      <p className="source">Chargement du bien…</p>
      <div className="sq sq-titre" />
      <section className="kpis">
        <div className="panel sq" />
        <div className="panel sq" />
        <div className="panel sq" />
      </section>
      <div className="panel graphique sq-grand" />
    </main>
  );
}
