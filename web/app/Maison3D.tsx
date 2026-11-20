'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type Props = {
  type: string;
  surface: number | null; // habitable, m²
  terrain: number | null; // m²
  pieces: number | null;
  commune: string;
  niveaux?: number | null; // BDNB bat_nb_niveaux
  hauteur?: number | null; // BDNB bat_hauteur_moy, m
};

const HAUTEUR_ETAGE = 2.5;
const fr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const fr1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Modèle 3D à l'échelle réelle (1 unité = 1 m) : emprise, terrain et découpage théorique en pièces. */
export function Maison3D({ type, surface, terrain, pieces, commune, niveaux = null, hauteur = null }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const appart = type !== 'Maison';

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 2 niveaux si grande surface, ou si un plain-pied ne tiendrait pas sur le terrain
    // niveaux BDNB si connus (maison seulement : pour un appartement c'est l'immeuble), sinon déduits
    const connu = !appart && niveaux != null && niveaux >= 1 ? Math.min(Math.round(niveaux), 5) : null;
    const etages = connu ?? (!appart && surface != null && (surface > 130 || (terrain != null && terrain > 0 && surface > terrain * 0.7)) ? 2 : 1);
    const hEtage = !appart && hauteur != null && hauteur > 0 ? Math.min(Math.max(hauteur / etages, 2.2), 4) : HAUTEUR_ETAGE;
    const emprise = surface != null && surface > 0 ? surface / etages : 0;
    const w = Math.sqrt(emprise * 1.4);
    const d = w > 0 ? emprise / w : 0;
    const cote = terrain != null && terrain > 0 ? Math.sqrt(terrain) : 0;
    // pelouse seulement si la maison tient dedans (sinon elle déborderait du carré)
    const pelouse = !appart && cote >= w && cote >= d && cote > 0;
    const rayon = Math.max(pelouse ? cote : 0, w, d, 10, 2 * hEtage * etages); // hauteur incluse dans le cadrage

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const soleil = new THREE.DirectionalLight(0xffffff, 0.8);
    soleil.position.set(rayon, rayon * 2, rayon);
    scene.add(soleil);

    const ajouter = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      scene.add(m);
    };
    const boite = (sx: number, sy: number, sz: number, mat: THREE.Material, x: number, y: number, z: number) =>
      ajouter(new THREE.BoxGeometry(sx, sy, sz), mat, x, y, z);

    // sol : pelouse à la taille du terrain, sinon sol neutre
    const cotesSol = pelouse ? cote : rayon * 2;
    ajouter(
      new THREE.PlaneGeometry(cotesSol, cotesSol).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: pelouse ? 0x9bc98a : 0xdcdcdc }),
      0, 0, 0,
    );

    if (emprise > 0) {
      const murs = new THREE.MeshStandardMaterial({ color: 0x80b1d3, transparent: true, opacity: 0.55 });
      const cloisons = new THREE.MeshStandardMaterial({ color: 0xb08968 });
      const dalle = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
      const e = 0.3;
      const h = hEtage * etages;

      boite(w, 0.05, d, new THREE.MeshStandardMaterial({ color: 0xffffff }), 0, 0.03, 0);
      boite(w, h, e, murs, 0, h / 2, -d / 2 + e / 2);
      boite(w, h, e, murs, 0, h / 2, d / 2 - e / 2);
      boite(e, h, d, murs, -w / 2 + e / 2, h / 2, 0);
      boite(e, h, d, murs, w / 2 - e / 2, h / 2, 0);
      for (let f = 1; f < etages; f++) boite(w, 0.15, d, dalle, 0, f * hEtage, 0);

      // pièces réparties entre étages (total exact), chaque étage découpé en rangées
      const total = Math.max(1, Math.round(pieces ?? 1));
      for (let f = 0; f < etages; f++) {
        const n = Math.max(1, Math.floor(total / etages) + (f < total % etages ? 1 : 0));
        const cols = Math.ceil(Math.sqrt(n));
        const rows = Math.ceil(n / cols);
        const y = f * hEtage + 0.6;
        const hr = d / rows;
        for (let j = 0; j < rows; j++) {
          const dansRangee = Math.min(cols, n - j * cols); // dernière rangée : pièces plus larges
          const z = -d / 2 + (j + 0.5) * hr;
          for (let i = 1; i < dansRangee; i++) boite(0.12, 1.2, hr - e, cloisons, -w / 2 + (i * w) / dansRangee, y, z);
          if (j > 0) boite(w - 2 * e, 1.2, 0.12, cloisons, 0, y, -d / 2 + j * hr);
        }
      }
    }

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, rayon * 20);
    const dist = rayon * 1.6;
    camera.position.set(dist * 0.7, dist * 0.7, dist * 0.7);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    el.appendChild(renderer.domElement);

    const rendre = () => renderer.render(scene, camera);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.addEventListener('change', rendre);

    const ajuster = () => {
      const lw = el.clientWidth || 400;
      const lh = el.clientHeight || 300;
      renderer.setSize(lw, lh);
      camera.aspect = lw / lh;
      camera.updateProjectionMatrix();
      rendre();
    };
    const obs = new ResizeObserver(ajuster);
    obs.observe(el);
    ajuster();

    return () => {
      obs.disconnect();
      controls.removeEventListener('change', rendre);
      controls.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      renderer.forceContextLoss(); // libère le contexte WebGL (navigateurs limités à ~16)
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [appart, surface, terrain, pieces, niveaux, hauteur]);

  const nd = (v: number | null, u: string) => (v == null ? 'n/d' : `${fr.format(v)} ${u}`);
  const ratio = surface && terrain ? ` (×${fr1.format(terrain / surface)} l'habitable)` : '';

  return (
    <>
      <div
        ref={ref}
        role="img"
        aria-label={`Modèle 3D à l'échelle réelle, ${type} à ${commune}`}
        style={{ position: 'relative', width: '100%', height: '360px', borderRadius: '12px', overflow: 'hidden', background: '#f0f0f0' }}
      />
      <p className="constat">
        {appart ? 'Appartement (étage non connu) · ' : ''}
        Habitable {nd(surface, 'm²')} · terrain {appart ? 'n/d' : nd(terrain, 'm²')}
        {appart ? '' : ratio} · {pieces == null ? 'n/d pièces' : `${fr.format(pieces)} pièce${pieces > 1 ? 's' : ''}`} · échelle réelle
      </p>
    </>
  );
}

export default Maison3D;
