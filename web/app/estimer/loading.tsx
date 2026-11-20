export default function Loading() {
  return (
    <main aria-busy="true">
      <div className="sq" style={{ minHeight: 44, maxWidth: 480 }} />
      <div className="sq" style={{ minHeight: 480, marginTop: 24 }} />
    </main>
  );
}
