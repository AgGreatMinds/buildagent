// Plano de corte horizontal do prédio: em vez de esconder grupos (o que deixava pessoas flutuando no
// andar de cima), tudo que é do prédio — lajes, vidro, móveis, bonecos e etiquetas — recebe o MESMO plano.
// Ele mantém o que está abaixo de y = constante; a câmera só mexe nessa constante (camera.ts).
import * as THREE from 'three';

// Normal (0,-1,0): a distância é (constante − y); fragmento com distância < 0 é descartado.
export const PLANO_CORTE = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4);
const LISTA = [PLANO_CORTE];

/**
 * Liga o corte em todos os materiais da árvore, exceto nas raízes em `ignorar` (céu, cidade, praça).
 * Idempotente e barata: material já marcado é pulado, então pode rodar de tempos em tempos para
 * pegar fileiras e bonecos que nascem depois. `clipShadows` impede que o telhado cortado ainda
 * projete sombra no andar de dentro.
 */
export function cortarArvore(raiz: THREE.Object3D, ignorar: ReadonlySet<THREE.Object3D>): void {
  const visitar = (obj: THREE.Object3D) => {
    if (ignorar.has(obj)) return;
    const material = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (material) {
      for (const m of Array.isArray(material) ? material : [material]) {
        if (m.userData.cortado) continue;
        m.userData.cortado = true;
        m.clippingPlanes = LISTA;
        m.clipShadows = true;
        m.needsUpdate = true;
      }
    }
    for (const filho of obj.children) visitar(filho);
  };
  visitar(raiz);
}
