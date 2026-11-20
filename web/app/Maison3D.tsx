'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

import type { Point } from '@/lib/api';

export function Maison3D({
  point,
  communes,
}: {
  point: Point | null;
  communes: { nom_commune: string; prix_m2_median: number | null }[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  // Données pour la modélisation générique
  const nbPieces = point?.nombre_pieces != null ? Math.max(1, Math.round(point.nombre_pieces)) : 4;
  const estMaison = point?.type === 'Maison';
  const nbEtages = estMaison ? 2 : 1;
  const largeur = estMaison ? 12 : 10;
  const profondeur = estMaison ? 10 : 8;

  const couleurMurs = estMaison ? 0x8dd3c7 : 0x80b1d3;
  const couleurToit = estMaison ? 0xb3de69 : 0xfccde5;

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    const camera = new THREE.PerspectiveCamera(45, 2, 0.1, 100);
    camera.position.set(20, 15, 20);
    camera.lookAt(0, 3, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(containerRef.current.clientWidth || 400, containerRef.current.clientHeight || 300);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);

    // Lumière ambiante
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    // Lumière directionnelle (soleil)
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // Sol
    const solGeo = new THREE.PlaneGeometry(40, 40);
    const solMat = new THREE.MeshStandardMaterial({ color: 0xe0e0e0 });
    const sol = new THREE.Mesh(solGeo, solMat);
    sol.rotation.x = -Math.PI / 2;
    scene.add(sol);

    // Grille au sol
    const grid = new THREE.GridHelper(40, 40, 0xcccccc, 0xeeeeee);
    scene.add(grid);

    // Fonction pour créer un mur
    const creerMur = (x: number, z: number, w: number, d: number, h: number, couleur: number) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mat = new THREE.MeshStandardMaterial({ color: couleur });
      const mur = new THREE.Mesh(geo, mat);
      mur.position.set(x, h / 2, z);
      scene.add(mur);
    };

    // Dessiner l'empreinte du bâtiment avec des murs pour chaque "pièce"
    // On répartit les pièces sur une grille
    const cols = Math.ceil(Math.sqrt(nbPieces));
    const rows = Math.ceil(nbPieces / cols);
    const pieceW = largeur / cols;
    const pieceD = profondeur / rows;

    let compteur = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (compteur >= nbPieces) break;
        const x = (c - cols / 2) * pieceW + pieceW / 2;
        const z = (r - rows / 2) * pieceD + pieceD / 2;

        // Murs de la pièce (hauteur par étage)
        const h = 3 * nbEtages;
        creerMur(x - pieceW / 2 + 0.1, z, 0.2, pieceD - 0.2, h, couleurMurs);
        creerMur(x + pieceW / 2 - 0.1, z, 0.2, pieceD - 0.2, h, couleurMurs);
        creerMur(x, z - pieceD / 2 + 0.1, pieceW - 0.2, 0.2, h, couleurMurs);
        creerMur(x, z + pieceD / 2 - 0.1, pieceW - 0.2, 0.2, h, couleurMurs);

        // Sol de la pièce
        const solPiece = new THREE.Mesh(
          new THREE.BoxGeometry(pieceW - 0.4, 0.1, pieceD - 0.4),
          new THREE.MeshStandardMaterial({ color: 0xffffff })
        );
        solPiece.position.set(x, 0.05, z);
        scene.add(solPiece);

        // Toit de la pièce (si 1 étage)
        if (nbEtages === 1) {
          const toit = new THREE.Mesh(
            new THREE.BoxGeometry(pieceW - 0.2, 0.8, pieceD - 0.2),
            new THREE.MeshStandardMaterial({ color: couleurToit })
          );
          toit.position.set(x, h - 0.4, z);
          scene.add(toit);
        }

        compteur++;
      }
    }

    // Toit global pour une maison (2 étages)
    if (estMaison) {
      const toit = new THREE.Mesh(
        new THREE.BoxGeometry(largeur - 0.4, 1.2, profondeur - 0.4),
        new THREE.MeshStandardMaterial({ color: couleurToit })
      );
      toit.position.set(0, 3 * nbEtages - 0.6, 0);
      scene.add(toit);

      // Cheminée
      const cheminee = new THREE.Mesh(
        new THREE.BoxGeometry(1, 2, 1),
        new THREE.MeshStandardMaterial({ color: 0x8b4513 })
      );
      cheminee.position.set(largeur / 2 - 2, 3 * nbEtages + 1, profondeur / 2 - 2);
      scene.add(cheminee);
    }

    // Etiquette nom commune
    const nomCom = point?.nom_commune ?? 'Bien';
    const label = document.createElement('div');
    label.style.position = 'absolute';
    label.style.top = '10px';
    label.style.left = '50%';
    label.style.transform = 'translateX(-50%)';
    label.style.background = 'rgba(255,255,255,0.9)';
    label.style.padding = '6px 12px';
    label.style.borderRadius = '20px';
    label.style.fontFamily = 'system-ui, sans-serif';
    label.style.fontSize = '14px';
    label.style.fontWeight = '600';
    label.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    label.textContent = estMaison ? `Maison — ${nomCom}` : `Appartement — ${nomCom}`;
    containerRef.current.appendChild(label);

    // Animation légère
    let angle = 0;
    const animer = () => {
      angle += 0.005;
      camera.position.x = Math.sin(angle) * 20;
      camera.position.z = Math.cos(angle) * 20;
      camera.lookAt(0, 3, 0);
      renderer.render(scene, camera);
      requestAnimationFrame(animer);
    };
    animer();

    setReady(true);

    return () => {
      renderer.dispose();
      containerRef.current!.removeChild(renderer.domElement);
      label.remove();
    };
  }, [point, communes, nbPieces, estMaison, nbEtages, largeur, profondeur, couleurMurs, couleurToit]);

  if (!ready) {
    return (
      <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
        Modélisation 3D en chargement…
      </div>
    );
  }

  return <div ref={containerRef} style={{ width: '100%', height: '300px', borderRadius: '12px', overflow: 'hidden', background: '#f0f0f0' }} />;
}

export default Maison3D;
