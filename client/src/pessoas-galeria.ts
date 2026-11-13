// Galeria isolada: a mesma Pessoa usada no prédio, com sementes explícitas e reproduzíveis.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Pessoa } from './people';
import { carregarPessoas } from './pessoa-glb';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x171d26);
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(12, 15, 26);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.8, 0);
controls.enableDamping = true;
controls.minDistance = 0.6; // permite chegar bem perto para avaliar rosto e roupa
scene.add(new THREE.HemisphereLight(0xf0f4ff, 0x6a6560, 2.3));
const light = new THREE.DirectionalLight(0xffedda, 3);
light.position.set(-5, 14, 8);
light.castShadow = true;
light.shadow.mapSize.set(2048, 2048);
Object.assign(light.shadow.camera, { left: -22, right: 22, top: 12, bottom: -12, near: 0.1, far: 40 });
light.shadow.normalBias = 0.025;
scene.add(light);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 40), new THREE.MeshStandardMaterial({ color: 0x343d49, roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Cadeiras, mesas e teclados são referências de pose da galeria; não fazem parte do orçamento da pessoa.
// Medidas iguais às do prédio (interior.ts: cadeira e mesaTrabalho): assento a 0,55 m, teclado 0,68 m à frente a 0,82 m.
const furnitureMaterial = new THREE.MeshStandardMaterial({ color: 0x606d7d });
for (let column = 0; column < 16; column++) {
  const x = (column - 7.5) * 2.1;
  for (const [w, h, d, y, z] of [[0.5, 0.08, 0.48, 0.51, -4.5], [0.46, 0.5, 0.07, 0.84, -4.73], [1.7, 0.05, 0.8, 0.775, -3.55], [0.42, 0.015, 0.14, 0.8125, -3.82]]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), furnitureMaterial);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}
let base = 1;
let people: Pessoa[] = [];
function populate() {
  // Libera somente recursos individuais; o material corporal é compartilhado por todas as pessoas.
  for (const person of people) {
    scene.remove(person.grupo);
    person.grupo.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) { object.geometry.dispose(); object.skeleton.dispose(); }
      if (object instanceof THREE.Sprite) { object.material.map?.dispose(); object.material.dispose(); }
    });
  }
  people = Array.from({ length: 48 }, (_, i) => {
    const seed = base + i;
    const row = Math.floor(i / 16);
    const x = (i % 16 - 7.5) * 2.1;
    const z = 4.5 - row * 4.5;
    const p = new Pessoa(`Semente ${seed}`, `Arquétipo ${seed % 8} · ${['em pé', 'andando', 'sentada'][row]}`, seed);
    p.grupo.position.set(x, 0, z);
    p.descanso.set(x, 0, row === 1 ? 1.4 : z);
    p.mesa.set(x, 0, z);
    p.definirEstado(row === 2 ? 'working' : 'idle');
    // Estabiliza a pose inicial sem alterar a animação pública.
    if (row !== 1) for (let step = 0; step < 90; step++) p.atualizar(1 / 60, step / 60);
    scene.add(p.grupo);
    return p;
  });
  // ?foco=<semente>: câmera de retrato na pessoa pedida; ?dist=<m> afasta (p.ex. 10 = distância do prédio).
  const params = new URLSearchParams(location.search);
  const foco = Number(params.get('foco'));
  const dist = Number(params.get('dist')) || 2.4;
  const alvo = people[foco - base];
  if (alvo) {
    const q = alvo.grupo.position;
    const sentada = foco - base >= 32;
    // Abaixo de 1,8 m o retrato mira o rosto; acima, o corpo inteiro.
    controls.target.set(q.x, dist < 1.8 ? (sentada ? 1.15 : 1.6) : sentada ? 0.95 : 1.15, q.z);
    camera.position.set(q.x + dist * 0.375, dist < 1.8 ? (sentada ? 1.3 : 1.72) : (sentada ? 1.9 : 1.55) + (dist - 2.4) * 0.45, q.z + dist);
  }
  document.querySelector('#range')!.textContent = `Sementes ${base}–${base + 47}`;
}
// A malha das pessoas é baixada uma vez; o botão só passa a valer depois dela.
void carregarPessoas().then(() => {
  document.querySelector('#seed')!.addEventListener('click', () => { base += 48; populate(); });
  populate();
});
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    if (i >= 16 && i < 32 && p.grupo.position.distanceTo(p.descanso) < 0.06) {
      p.descanso.z *= -1;
      p.definirEstado('idle');
    }
    p.atualizar(dt, clock.elapsedTime);
  }
  controls.update();
  renderer.render(scene, camera);
});
