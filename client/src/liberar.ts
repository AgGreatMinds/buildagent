// Descarte de GPU de uma árvore que saiu da cena (pessoa que foi embora, fileira desmontada).
// Sem isto, cada pessoa que sai deixava na placa de vídeo a geometria do corpo, a textura do
// esqueleto e a da etiqueta; cada fileira, a geometria mesclada e a placa com textura.
// Material marcado como compartilhado (`userData.compartilhado`, ex.: MAT do interior, corpo das
// pessoas) nunca é descartado: outros objetos vivos ainda o usam.
import * as THREE from 'three';

/** Marca materiais usados por muitos objetos: liberarArvore passa reto por eles. */
export function marcarCompartilhado(...materiais: THREE.Material[]): void {
  for (const m of materiais) m.userData.compartilhado = true;
}

/** Libera geometrias, esqueletos, materiais próprios e as texturas deles. Chamar depois de tirar da cena. */
export function liberarArvore(raiz: THREE.Object3D): void {
  raiz.traverse((o) => {
    // Sprite usa uma geometria única do three, compartilhada por todos os sprites: não descartar.
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.dispose(); // textura dos ossos
    const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      if (m.userData.compartilhado) continue;
      // Toda textura pendurada no material (map, emissiveMap…) é desta peça.
      for (const v of Object.values(m)) if ((v as THREE.Texture | null)?.isTexture) (v as THREE.Texture).dispose();
      m.dispose();
    }
  });
}
