// Céu e luz pela hora local: dia claro, noite escura, entardecer. A hora pode ser forçada com ?hora=22 para testar.
import * as THREE from 'three';

export function horaAtual(): number {
  const q = new URLSearchParams(location.search).get('hora');
  if (q !== null && !Number.isNaN(Number(q))) return Number(q);
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

// 0 = noite fechada, 1 = dia pleno (curva suave no amanhecer e no entardecer).
export function fatorDia(hora: number): number {
  const s = Math.sin(((hora - 6) / 12) * Math.PI);
  return Math.min(1, Math.max(0, s * 1.6));
}

const TOPO_DIA = new THREE.Color(0x5b9bd5), HOR_DIA = new THREE.Color(0xcfe3f2);
// Noite de cidade: o horizonte guarda o clarão das luzes (azul-petróleo), não o preto — é ele, com a
// lua, que recorta a silhueta dos prédios; com céu e prédio pretos, as janelas pareciam soltas no ar.
const TOPO_NOITE = new THREE.Color(0x050a16), HOR_NOITE = new THREE.Color(0x24324f);
const HOR_POR_DO_SOL = new THREE.Color(0xf0a070);

export class Mundo {
  readonly cupula: THREE.Mesh;
  readonly estrelas: THREE.Points;
  readonly hemi = new THREE.HemisphereLight(0xdfeaf5, 0x39404a, 1);
  readonly sol = new THREE.DirectionalLight(0xfff1dc, 1);
  readonly lua = new THREE.DirectionalLight(0x8fa8d8, 0);
  noite = 0;
  private uTopo = { value: new THREE.Color() };
  private uHor = { value: new THREE.Color() };

  constructor(readonly cena: THREE.Scene) {
    // Cúpula do céu: gradiente do horizonte ao topo em um shader mínimo.
    this.cupula = new THREE.Mesh(
      new THREE.SphereGeometry(1000, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { topo: this.uTopo, hor: this.uHor },
        vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 topo; uniform vec3 hor; varying float h; void main(){ gl_FragColor = vec4(mix(hor, topo, pow(clamp(h,0.0,1.0), 0.55)), 1.0); }',
      }),
    );
    cena.add(this.cupula);

    // Estrelas: 300 pontos fixos, visíveis só à noite.
    const pos = new Float32Array(300 * 3);
    for (let i = 0; i < 300; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 0.9 + 0.1);
      pos.set([Math.cos(a) * Math.sin(b) * 900, Math.cos(b) * 900, Math.sin(a) * Math.sin(b) * 900], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.estrelas = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, transparent: true, fog: false }));
    cena.add(this.estrelas);

    this.sol.castShadow = true;
    this.sol.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sol.shadow.camera, { left: -48, right: 48, top: 34, bottom: -34, near: 1, far: 160 });
    cena.add(this.hemi, this.sol, this.sol.target, this.lua);
    this.lua.position.set(-30, 60, -20);
    cena.fog = new THREE.Fog(0x000000, 170, 560);
  }

  // Aplica a hora: cores do céu, intensidade do sol/lua e posição do sol no arco do dia.
  aplicar(hora: number) {
    const dia = fatorDia(hora);
    this.noite = 1 - dia;
    // Perto de 6h e 18h o horizonte esquenta (pôr/nascer do sol).
    const pordosol = Math.max(0, 1 - Math.abs(dia - 0.35) / 0.35) * (dia > 0 && dia < 1 ? 1 : 0);
    this.uTopo.value.lerpColors(TOPO_NOITE, TOPO_DIA, dia);
    this.uHor.value.lerpColors(HOR_NOITE, HOR_DIA, dia).lerp(HOR_POR_DO_SOL, pordosol * 0.55);
    (this.cena.fog as THREE.Fog).color.copy(this.uHor.value);
    (this.estrelas.material as THREE.PointsMaterial).opacity = Math.min(1, this.noite * 1.4);
    this.hemi.intensity = 0.34 + dia * 0.84;
    this.sol.intensity = dia * 2.4;
    this.sol.color.setHex(0xffffff).lerp(new THREE.Color(0xffb27a), pordosol * 0.6);
    const ang = ((hora - 6) / 12) * Math.PI;
    this.sol.position.set(Math.cos(ang) * 70, Math.max(8, Math.sin(ang) * 70), 38);
    this.lua.intensity = this.noite * 0.9; // luz de lado: dá volume às torres (uma face clara, outra escura)
  }
}
