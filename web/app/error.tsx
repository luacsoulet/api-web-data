"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main>
      <h1>Données indisponibles</h1>
      <p>L&apos;API se réveille (environ 50 s sur l&apos;offre gratuite). Patientez un instant puis réessayez.</p>
      <button className="bouton" onClick={() => reset()}>
        Réessayer
      </button>
    </main>
  );
}
