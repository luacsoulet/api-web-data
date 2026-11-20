export default function Loading() {
  return (
    <main aria-busy="true">
      <p className="source">Chargement des données…</p>
      <h1>Où chercher un logement autour d&apos;Orléans, et pour quel budget ?</h1>
      <div className="filtre sq" />
      <section className="kpis">
        <div className="panel sq" />
        <div className="panel sq" />
        <div className="panel sq" />
      </section>
      <div className="panel graphique sq-grand" />
    </main>
  );
}
