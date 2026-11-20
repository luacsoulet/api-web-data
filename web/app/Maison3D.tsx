'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Geometrie } from '@/lib/api';

export type Props = {
  type: string;
  surface: number | null; // habitable, m²
  terrain: number | null; // m²
  pieces: number | null;
  commune: string;
  niveaux?: number | null; // BDNB bat_nb_niveaux
  hauteur?: number | null; // BDNB bat_hauteur_moy, m
  geometrie?: Geometrie | null; // formes réelles (cadastre Etalab), mètres locaux
  murs?: string | null; // bat_materiau_murs
  toit?: string | null; // bat_materiau_toit
  annee?: number | null;
  jardin?: boolean;
  nbLogements?: number | null;
};

const matchCouleur = (v: string | null | undefined, table: [RegExp, number][], defaut: number) => {
  const t = (v ?? '').toLowerCase();
  return table.find(([re]) => re.test(t))?.[1] ?? defaut;
};
const COULEUR_MURS: [RegExp, number][] = [
  [/pierre|meuli/, 0xd8c3a0], [/brique/, 0xa0522d], [/b[eé]ton|agglo/, 0x9a9a9a], [/bois/, 0x8b6b4a],
];
const COULEUR_TOIT: [RegExp, number][] = [[/tuile/, 0xb5532f], [/ardoise/, 0x4a4f57], [/zinc/, 0xb8bec4]];

const HAUTEUR_ETAGE = 2.5;
const fr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const fr1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Modèle 3D à l'échelle réelle (1 unité = 1 m) : emprise, terrain et découpage théorique en pièces. */
export function Maison3D({
  type, surface, terrain, pieces, commune, niveaux = null, hauteur = null,
  geometrie = null, murs: matMurs = null, toit: matToit = null, annee = null, jardin = false, nbLogements = null,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const appart = type !== 'Maison';
  const reel = geometrie != null && geometrie.parcelles.length > 0;
  const nbNiv = niveaux != null && niveaux >= 1 ? Math.min(Math.round(niveaux), 12) : null;

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
    let rayon = Math.max(pelouse ? cote : 0, w, d, 10, 2 * hEtage * etages); // hauteur incluse dans le cadrage

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const soleil = new THREE.DirectionalLight(0xffffff, 0.8);
    scene.add(soleil);

    const ajouter = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      scene.add(m);
    };
    const boite = (sx: number, sy: number, sz: number, mat: THREE.Material, x: number, y: number, z: number) =>
      ajouter(new THREE.BoxGeometry(sx, sy, sz), mat, x, y, z);

    if (geometrie && reel) {
      // repère local : x est, y nord -> three X, -Z ; centré sur la boîte englobante des parcelles
      const pts = geometrie.parcelles.flat();
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const forme = (a: number[][]) => new THREE.Shape(a.map((p) => new THREE.Vector2(p[0] - cx, p[1] - cy)));
      const plat = (a: number[][]) => new THREE.ShapeGeometry(forme(a)).rotateX(-Math.PI / 2);
      const extruder = (a: number[][], h: number) =>
        new THREE.ExtrudeGeometry(forme(a), { depth: h, bevelEnabled: false }).rotateX(-Math.PI / 2);
      const mat = (color: number, opacity = 1) =>
        new THREE.MeshStandardMaterial({ color, transparent: opacity < 1, opacity });

      const sol = mat(jardin ? 0x9bc98a : 0xdcdcdc);
      const contour = new THREE.LineBasicMaterial({ color: 0xf2b705 });
      for (const a of geometrie.parcelles) {
        ajouter(plat(a), sol, 0, 0, 0);
        scene.add(
          new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(a.map((p) => new THREE.Vector3(p[0] - cx, 0.05, -(p[1] - cy)))),
            contour,
          ),
        );
      }

      const niv = nbNiv ?? (appart ? 3 : etages);
      const hE = hauteur != null && hauteur > 0 ? Math.min(Math.max(hauteur / niv, 2.2), 4) : HAUTEUR_ETAGE;
      const hDur = niv * hE;
      const matMur = mat(matchCouleur(matMurs, COULEUR_MURS, 0x80b1d3), appart ? 0.5 : 0.92);
      const matToitSlab = mat(matchCouleur(matToit, COULEUR_TOIT, 0x777777));
      const dalleMat = mat(0xffffff, 0.35);
      const leger = mat(0xc9b79c);
      let hMax = 0;
      for (const b of geometrie.batiments) {
        if (b.type === 'leger') {
          ajouter(extruder(b.anneau, 2.5), leger, 0, 0, 0);
          hMax = Math.max(hMax, 2.5);
          continue;
        }
        ajouter(extruder(b.anneau, hDur), matMur, 0, 0, 0);
        ajouter(extruder(b.anneau, 0.25), matToitSlab, 0, hDur, 0);
        for (let f = 1; f < niv; f++) ajouter(extruder(b.anneau, 0.15), dalleMat, 0, f * hE, 0);
        hMax = Math.max(hMax, hDur + 0.25);
      }
      const eau = mat(0x2a9fd6);
      for (const a of geometrie.piscines) ajouter(extruder(a, 0.3), eau, 0, -0.28, 0); // sommet à +2 cm : visible sur le sol

      const dimX = Math.max(...xs) - Math.min(...xs);
      const dimY = Math.max(...ys) - Math.min(...ys);
      rayon = Math.max(Math.max(dimX, dimY) / 2, 2 * hMax, 10);
    } else {
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
    }

    soleil.position.set(rayon, rayon * 2, rayon);

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
        if (o instanceof THREE.Mesh || o instanceof THREE.LineLoop) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      renderer.forceContextLoss(); // libère le contexte WebGL (navigateurs limités à ~16)
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [appart, surface, terrain, pieces, niveaux, hauteur, geometrie, reel, matMurs, matToit, jardin, nbNiv]);

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
        {reel && appart
          ? `Appartement dans un immeuble de ${nbNiv ?? 'n/d'} niveaux, ${nbLogements ?? 'n/d'} logements (étage inconnu) · `
          : appart ? 'Appartement (étage non connu) · ' : ''}
        Habitable {nd(surface, 'm²')} · terrain {appart ? 'n/d' : nd(terrain, 'm²')}
        {appart ? '' : ratio} · {pieces == null ? 'n/d pièces' : `${fr.format(pieces)} pièce${pieces > 1 ? 's' : ''}`} · échelle réelle
        {annee != null ? ` · construit en ${annee}` : ''}
        {matMurs ? ` · murs ${matMurs.toLowerCase()}` : ''}
        {matToit ? ` · toit ${matToit.toLowerCase()}` : ''}
        {geometrie ? ` · dépendances : ${geometrie.batiments.filter((b) => b.type === 'leger').length}` : ''}
        {geometrie?.piscines.length ? ` · piscine${geometrie.piscines.length > 1 ? 's' : ''} : ${geometrie.piscines.length}` : ''}
        {reel ? ' · agencement inconnu' : ''}
        {` · ${reel ? 'forme réelle (cadastre Etalab)' : 'forme estimée'}`}
      </p>
    </>
  );
}

export default Maison3D;
