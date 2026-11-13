# Gera as pessoas do BuildAgent no Blender.
#   Blender -b --factory-startup -P gerar.py -- --out <pasta>
# Tudo é modelado por código: corpo contínuo (modificador Skin + subdivisão), cabeça esculpida por função,
# cabelos que abraçam o crânio, rosto, sapatos e crachá. Sai um GLB com um esqueleto de 12 ossos (os mesmos
# nomes e posições de client/src/people.ts) e uma malha por peça. Cada região é um material de nome fixo
# (pele, blusa, calca...), que o cliente troca por cor de vértice conforme a semente da pessoa.
#
# Eixos: Blender Z para cima, pessoa olhando para -Y. No glTF vira Y para cima, olhando para +Z.
import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(nome, padrao=None):
    return ARGS[ARGS.index(nome) + 1] if nome in ARGS else padrao
OUT = arg('--out', os.path.dirname(os.path.abspath(__file__)))
DECIMAR = float(arg('--decimar', '0.268'))  # fração de triângulos do corpo que fica

# ---------- Esqueleto (coordenadas do three.js: x, y para cima, z para a frente) ----------
# Igual a createBones() em client/src/people.ts. O lado "left" fica em x negativo, como lá.
SX = 0.192  # meia distância entre os ombros
OSSOS = {  # nome: (pai, posição absoluta em repouso no three.js)
    'hips': (None, (0, 0.80, 0)),
    'spine': ('hips', (0, 1.06, 0)),
    'neck': ('spine', (0, 1.42, 0)),
    'head': ('neck', (0, 1.58, 0)),
    'leftShoulder': ('spine', (-SX, 1.33, 0)),
    'leftElbow': ('leftShoulder', (-SX, 1.06, 0)),
    'rightShoulder': ('spine', (SX, 1.33, 0)),
    'rightElbow': ('rightShoulder', (SX, 1.06, 0)),
    'leftHip': ('hips', (-0.09, 0.80, 0)),
    'leftKnee': ('leftHip', (-0.09, 0.43, 0)),
    'rightHip': ('hips', (0.09, 0.80, 0)),
    'rightKnee': ('rightHip', (0.09, 0.43, 0)),
}
PONTA = {  # fim de cada osso (só para o Blender desenhar)
    'hips': (0, 1.06, 0), 'spine': (0, 1.42, 0), 'neck': (0, 1.58, 0), 'head': (0, 1.74, 0),
    'leftShoulder': (-SX, 1.06, 0), 'leftElbow': (-SX, 0.76, 0),
    'rightShoulder': (SX, 1.06, 0), 'rightElbow': (SX, 0.76, 0),
    'leftHip': (-0.09, 0.43, 0), 'leftKnee': (-0.09, 0.03, 0),
    'rightHip': (0.09, 0.43, 0), 'rightKnee': (0.09, 0.03, 0),
}
def b(p):  # three.js (x, y, z) -> Blender (x, -z, y)
    return Vector((p[0], -p[2], p[1]))

# Alturas das fronteiras de roupa (m)
Z_SOLA, Z_SAPATO, Z_BARRA, Z_GOLA = 0.024, 0.105, 0.925, 1.428
Z_PUNHO, Z_MANGA_CURTA = 0.845, 1.135

# ---------- Materiais = regiões (o cliente pinta por nome) ----------
CORES = {
    'pele': (0.80, 0.56, 0.42), 'blusa': (0.17, 0.30, 0.46), 'calca': (0.16, 0.17, 0.21),
    'sapato': (0.10, 0.10, 0.11), 'sola': (0.86, 0.85, 0.82), 'cabelo': (0.12, 0.08, 0.06),
    'olho': (0.04, 0.04, 0.05), 'brilho': (1, 1, 1), 'sobrancelha': (0.10, 0.07, 0.05),
    'boca': (0.42, 0.17, 0.15), 'gola': (0.93, 0.93, 0.90), 'cracha': (0.94, 0.93, 0.90),
    'cordao': (0.95, 0.42, 0.13), 'acessorio': (0.12, 0.12, 0.13),
}
MAT = {}
def material(nome):
    if nome not in MAT:
        m = bpy.data.materials.new(nome)
        m.use_nodes = True
        bsdf = next(n for n in m.node_tree.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled')
        c = CORES[nome]
        bsdf.inputs['Base Color'].default_value = (c[0], c[1], c[2], 1)
        bsdf.inputs['Roughness'].default_value = 0.3 if nome == 'olho' else 0.82
        m.diffuse_color = (c[0], c[1], c[2], 1)
        MAT[nome] = m
    return MAT[nome]

def novo_objeto(nome, bm):
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob

def ativar(ob):
    bpy.context.view_layer.update()
    for o in bpy.context.scene.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob

def suave(ob):
    for p in ob.data.polygons:
        p.use_smooth = True

def aplicar_modificadores(ob):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    velha = ob.data
    ob.data = me
    bpy.data.meshes.remove(velha)

def smoothstep(a, c, x):
    if a == c:
        return 0.0 if x < a else 1.0
    t = min(1.0, max(0.0, (x - a) / (c - a)))
    return t * t * (3 - 2 * t)

def interp(pontos, z):
    """Interpolação linear por trechos; pontos = [(z, valor)] em z decrescente."""
    if z >= pontos[0][0]:
        return pontos[0][1]
    for (z0, v0), (z1, v1) in zip(pontos[:-1], pontos[1:]):
        if z >= z1:
            return v0 + (v1 - v0) * (z0 - z) / (z0 - z1)
    return pontos[-1][1]

# O braço pende um pouco aberto (como em gente de verdade): a mão fica ao lado da coxa, sem encostar.
BRACO = [(1.325, SX - 0.004), (1.06, SX + 0.014), (0.835, SX + 0.026), (0.742, SX + 0.030)]
def braco_x(z):
    return interp(BRACO, z)

def e_braco(x, z):
    """O ponto é do braço? Abaixo da axila o braço é um tubo separado do tronco."""
    return z < 1.262 and abs(x) > braco_x(z) - 0.054

# ---------- Cabeça: elipsoide esculpido por função ----------
CABECA_C = Vector((0, 0.004, 1.600))  # centro (Blender)
CAB_RX, CAB_RY, CAB_RZ = 0.102, 0.110, 0.126
def cabeca_ponto(d):
    """Ponto da superfície da cabeça na direção unitária d (a partir do centro)."""
    x, y, z = d.x, d.y, d.z
    sx, sy, sz = CAB_RX, CAB_RY, CAB_RZ
    baixo = max(0.0, -z)
    # Mandíbula: afina para o queixo, mais pelos lados que pela frente.
    sx *= 1 - 0.30 * baixo ** 1.6
    sy *= 1 - 0.16 * baixo ** 1.6
    # Nuca um pouco mais cheia; rosto um pouco mais plano.
    if y > 0:
        sy *= 1 + 0.05 * y
    else:
        sy *= 1 - 0.05 * (-y) * (1 - abs(z))
    p = Vector((x * sx, y * sy, z * sz))
    # Queixo: leve avanço à frente e embaixo.
    queixo = math.exp(-((x / 0.35) ** 2 + ((y + 0.62) / 0.4) ** 2 + ((z + 0.72) / 0.3) ** 2))
    p += Vector((0, -0.010, -0.004)) * queixo
    # Bochechas: enche um pouco os lados da frente, abaixo dos olhos.
    for lado in (-1, 1):
        boch = math.exp(-(((x - lado * 0.55) / 0.3) ** 2 + ((y + 0.6) / 0.35) ** 2 + ((z + 0.28) / 0.3) ** 2))
        p += Vector((lado * 0.003, -0.004, 0)) * boch
    return CABECA_C + p

def cabeca_normal(d):
    e = 1e-3
    t = d.cross(Vector((0, 0, 1)))
    if t.length < 1e-4:
        t = Vector((1, 0, 0))
    t.normalize()
    u = d.cross(t).normalized()
    p0 = cabeca_ponto(d)
    pa = cabeca_ponto((d + t * e).normalized())
    pb = cabeca_ponto((d + u * e).normalized())
    n = (pa - p0).cross(pb - p0)
    n.normalize()
    return n if n.dot(d) > 0 else -n

def dir_esf(theta, phi):
    """theta: ângulo em volta do eixo vertical (0 = frente, -Y; positivo para +X); phi: 0 no topo, pi embaixo."""
    return Vector((math.sin(phi) * math.sin(theta), -math.sin(phi) * math.cos(theta), math.cos(phi)))

def base_rosto(d):
    """Base ortonormal colada ao rosto na direção d: (lateral, cima, normal)."""
    n = cabeca_normal(d)
    lateral = Vector((0, 0, 1)).cross(n).normalized()
    cima = n.cross(lateral).normalized()
    return lateral, cima, n

def elipsoide(bm, centro, raios, mat_idx, rot=None, seg=12, an=8):
    verts = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=an, radius=1)['verts']
    faces = set()
    for v in verts:
        p = Vector((v.co.x * raios[0], v.co.y * raios[1], v.co.z * raios[2]))
        if rot is not None:
            p = rot @ p
        v.co = centro + p
        for f in v.link_faces:
            faces.add(f)
    for f in faces:
        f.material_index = mat_idx
    return verts

def tubo(bm, pts, raio, mat_idx, lados=8, fechar=True, ref=None):
    """Tubo contínuo ao longo de uma lista de pontos (anéis ligados; pontas afinadas e fechadas).
    ref: direção fixa para orientar os anéis (evita torção em curvas que passam pela vertical)."""
    aneis = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        if ref is not None:
            u = ref - t * ref.dot(t)
            u = u.normalized() if u.length > 1e-6 else t.orthogonal().normalized()
        else:
            eixo = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            u = t.cross(eixo).normalized()
        w = t.cross(u).normalized()
        r = raio * (0.55 if fechar and i in (0, len(pts) - 1) else 1.0)
        aneis.append([bm.verts.new(p + (u * math.cos(2 * math.pi * k / lados) + w * math.sin(2 * math.pi * k / lados)) * r) for k in range(lados)])
    faces = []
    for a_, c_ in zip(aneis[:-1], aneis[1:]):
        for k in range(lados):
            k2 = (k + 1) % lados
            faces.append(bm.faces.new((a_[k], a_[k2], c_[k2], c_[k])))
    if fechar:
        faces.append(bm.faces.new(aneis[0][::-1]))
        faces.append(bm.faces.new(aneis[-1]))
    for f in faces:
        f.material_index = mat_idx
    return faces

def criar_cabeca():
    bm = bmesh.new()
    seg, an = 20, 12
    grade = []
    for j in range(an + 1):
        phi = math.pi * j / an
        linha = []
        for i in range(seg):
            theta = 2 * math.pi * i / seg
            linha.append(None if j in (0, an) else bm.verts.new(cabeca_ponto(dir_esf(theta, phi))))
        grade.append(linha)
    topo = bm.verts.new(cabeca_ponto(Vector((0, 0, 1))))
    base = bm.verts.new(cabeca_ponto(Vector((0, 0, -1))))
    for j in range(an):
        for i in range(seg):
            i2 = (i + 1) % seg
            if j == 0:
                bm.faces.new((topo, grade[1][i], grade[1][i2]))
            elif j == an - 1:
                bm.faces.new((grade[j][i2], grade[j][i], base))
            else:
                bm.faces.new((grade[j][i], grade[j + 1][i], grade[j + 1][i2], grade[j][i2]))
    # Nariz: pequeno volume arredondado.
    centro_n = cabeca_ponto(Vector((0, -1, -0.17)).normalized()) + Vector((0, 0.005, 0))
    elipsoide(bm, centro_n, (0.0135, 0.019, 0.0195), 0, None, 8, 6)
    # Orelhas: elipsoides achatados nas laterais.
    for lado in (-1, 1):
        c = cabeca_ponto(Vector((lado, 0.08, -0.08)).normalized()) + Vector((lado * 0.003, 0, 0))
        elipsoide(bm, c, (0.011, 0.016, 0.026), 0, None, 8, 6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = novo_objeto('cabeca', bm)
    ob.data.materials.append(material('pele'))
    suave(ob)
    return ob

def criar_rosto(feminino=False):
    """Olhos grandes e escuros com brilho, sobrancelhas e boca: lê de longe."""
    bm = bmesh.new()
    mats = ['olho', 'brilho', 'sobrancelha', 'boca']
    for lado in (-1, 1):
        d = Vector((lado * 0.37, -1, 0.03)).normalized()
        p = cabeca_ponto(d)
        lateral, cima, n = base_rosto(d)
        rot = Matrix((lateral, cima, n)).transposed()
        elipsoide(bm, p + n * 0.001, (0.0140, 0.0195 if feminino else 0.0178, 0.0052), 0, rot, 10, 5)
        elipsoide(bm, p + n * 0.0054 + lateral * 0.0042 + cima * 0.0062, (0.0040, 0.0040, 0.0016), 1, rot, 6, 4)
        if feminino:  # cílio: traço curto no canto de fora
            pts = [p + n * 0.004 + lateral * lado * (0.010 + 0.005 * k) + cima * (0.012 + 0.003 * k) for k in range(3)]
            tubo(bm, pts, 0.0016, 0, 5)
        # sobrancelha: arco fino acima do olho
        pts = []
        for k in range(-3, 4):
            a_ = k / 3
            ds = Vector((lado * 0.37 + a_ * 0.17, -1, 0.335 - 0.05 * a_ * a_ - lado * a_ * 0.035)).normalized()
            pts.append(cabeca_ponto(ds) + cabeca_normal(ds) * 0.0016)
        tubo(bm, pts, 0.0036 if feminino else 0.0050, 2, 6)
    # boca: sorriso curto, um tubo contínuo colado ao rosto
    pts = []
    for k in range(-4, 5):
        a_ = k / 4
        d = Vector((a_ * 0.19, -1, -0.47 - 0.050 * (1 - a_ * a_))).normalized()
        pts.append(cabeca_ponto(d) + cabeca_normal(d) * 0.0012)
    tubo(bm, pts, 0.0034, 3, 6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = novo_objeto('rosto', bm)
    for m in mats:
        ob.data.materials.append(material(m))
    suave(ob)
    return ob

# ---------- Corpo: grafo + modificador Skin ----------
def criar_corpo(feminino=False):
    f = feminino
    peito, cintura, quadril = (0.124, 0.102, 0.130) if f else (0.132, 0.118, 0.124)
    ombro_r, braco_r, antebraco_r = (0.046, 0.036, 0.030) if f else (0.052, 0.041, 0.034)
    coxa_r, joelho_r, tornozelo_r = (0.072, 0.055, 0.049) if f else (0.072, 0.058, 0.052)
    nos = {  # nome: (posição Blender, raio)
        'pelve': ((0, 0, 0.87), quadril),
        'cintura': ((0, 0, 1.04), cintura),
        'peito': ((0, 0, 1.21), peito),
        'alto': ((0, 0, 1.335), 0.096 if f else 0.104),
        'pescoco0': ((0, 0.004, 1.415), 0.050 if f else 0.058),
        'pescoco1': ((0, 0.004, 1.50), 0.044 if f else 0.052),
    }
    arestas = [('pelve', 'cintura'), ('cintura', 'peito'), ('peito', 'alto'), ('alto', 'pescoco0'), ('pescoco0', 'pescoco1')]
    for lado, s in (('E', -1), ('D', 1)):
        nos[f'ombro{lado}'] = ((s * braco_x(1.325), 0, 1.325), ombro_r)
        nos[f'cotovelo{lado}'] = ((s * braco_x(1.06), 0.004, 1.06), braco_r)
        nos[f'pulso{lado}'] = ((s * braco_x(0.835), -0.006, 0.835), antebraco_r)
        nos[f'mao{lado}'] = ((s * braco_x(0.742), -0.016, 0.742), 0.043 if f else 0.047)
        nos[f'coxa{lado}'] = ((s * 0.090, 0, 0.79), coxa_r)
        nos[f'joelho{lado}'] = ((s * 0.090, -0.004, 0.43), joelho_r)
        nos[f'tornozelo{lado}'] = ((s * 0.090, 0.010, 0.105), tornozelo_r)
        nos[f'calcanhar{lado}'] = ((s * 0.090, 0.036, 0.048), 0.046)
        nos[f'ponta{lado}'] = ((s * 0.096, -0.160, 0.044), 0.043)
        arestas += [('alto', f'ombro{lado}'), (f'ombro{lado}', f'cotovelo{lado}'), (f'cotovelo{lado}', f'pulso{lado}'),
                    (f'pulso{lado}', f'mao{lado}'), ('pelve', f'coxa{lado}'), (f'coxa{lado}', f'joelho{lado}'),
                    (f'joelho{lado}', f'tornozelo{lado}'), (f'tornozelo{lado}', f'calcanhar{lado}'), (f'calcanhar{lado}', f'ponta{lado}')]
    bm = bmesh.new()
    vs = {n: bm.verts.new(p) for n, (p, _r) in nos.items()}
    for a, c in arestas:
        bm.edges.new((vs[a], vs[c]))
    bm.verts.index_update()
    idx = {n: vs[n].index for n in nos}
    ob = novo_objeto('grafo', bm)
    ativar(ob)
    bpy.ops.mesh.customdata_skin_add()
    camada = ob.data.skin_vertices[0].data
    for n, (_p, r) in nos.items():
        camada[idx[n]].radius = (r, r)
        camada[idx[n]].use_root = n == 'pelve'
    sk = ob.modifiers.new('Skin', 'SKIN')
    sk.branch_smoothing = 0.0
    sub = ob.modifiers.new('Sub', 'SUBSURF')
    sub.levels = 2
    aplicar_modificadores(ob)
    ob.name = 'corpo'
    malha = ob.data

    # ---- Escultura por função: tronco achatado, mãos finas, solas planas ----
    for v in malha.vertices:
        x, y, z = v.co
        braco = e_braco(x, z) and z > 0.60
        if not braco and z > 0.72:
            # Tronco: seção elíptica (largura intacta, profundidade menor).
            k = smoothstep(0.72, 0.86, z) * (1 - smoothstep(1.37, 1.44, z))
            y *= 1 - 0.30 * k
            # peito à frente
            y -= (0.014 if f else 0.008) * k * smoothstep(1.08, 1.22, z) * (1 - smoothstep(1.26, 1.38, z)) * smoothstep(0.0, -0.05, y)
        if braco:
            # mão: achata na espessura (palma para a coxa) e alarga um pouco
            m = 1 - smoothstep(0.795, 0.835, z)
            cx = math.copysign(braco_x(z), x)
            x = cx + (x - cx) * (1 - 0.50 * m)
            y = -0.016 * m + (y + 0.016 * m) * (1 + 0.10 * m)
        if z < 0.24 and not braco:
            # sola plana; bico mais baixo que o peito do pé
            if z < 0.014:
                z = 0.0
            frente = smoothstep(-0.02, -0.17, y)
            if z > 0.04:
                z -= (z - 0.04) * 0.42 * frente
        v.co = (x, y, z)

    # ---- Menos triângulos, mantendo a forma ----
    dec = ob.modifiers.new('Dec', 'DECIMATE')
    dec.ratio = DECIMAR
    dec.use_symmetry = True
    dec.symmetry_axis = 'X'
    aplicar_modificadores(ob)
    return ob

def cortar(ob, alturas):
    """Corta a malha em planos horizontais: as fronteiras de roupa viram arestas retas."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for z in alturas:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, z), plane_no=(0, 0, 1), dist=1e-5)
    bm.to_mesh(ob.data)
    bm.free()

REGIOES = ['pele', 'blusa', 'calca', 'sapato', 'sola']
INFLA = {'blusa': 0.0080, 'calca': 0.0040, 'sapato': 0.0100, 'sola': 0.0115, 'pele': 0.0}

def vestir(ob, manga_curta=False):
    """Pinta regiões (materiais) e infla a roupa: a barra, o punho e o cano do sapato viram degrau.
    Devolve a posição de cada vértice ANTES de inflar (os pesos são calculados nela)."""
    cortar(ob, [Z_SOLA, Z_SAPATO, Z_BARRA, Z_GOLA, Z_PUNHO, Z_MANGA_CURTA])
    me = ob.data
    for n in REGIOES:
        me.materials.append(material(n))
    def regiao(p):
        x, y, z = p
        if e_braco(x, z):
            return 'blusa' if z > (Z_MANGA_CURTA if manga_curta else Z_PUNHO) else 'pele'
        if z < Z_SOLA:
            return 'sola'
        if z < Z_SAPATO:
            return 'sapato'
        if z < Z_BARRA:
            return 'calca'
        if z < Z_GOLA:
            return 'blusa'
        return 'pele'
    bm = bmesh.new()
    bm.from_mesh(me)
    for fc in bm.faces:
        fc.material_index = REGIOES.index(regiao(fc.calc_center_median()))
    # separa as regiões nas fronteiras para o degrau sair nítido
    fronteira = [e for e in bm.edges if len({fc.material_index for fc in e.link_faces}) > 1]
    bmesh.ops.split_edges(bm, edges=fronteira)
    bm.verts.ensure_lookup_table()
    bm.verts.index_update()
    bm.normal_update()
    orig = [v.co.copy() for v in bm.verts]
    def chave(p):
        return (round(p.x, 5), round(p.y, 5), round(p.z, 5))
    pares = {}
    for e in bm.edges:
        if e.is_boundary:
            k = tuple(sorted((chave(e.verts[0].co), chave(e.verts[1].co))))
            pares.setdefault(k, []).append(e)
    for v in bm.verts:
        if not v.link_faces:
            continue
        r = REGIOES[v.link_faces[0].material_index]
        n = v.normal
        if r in ('sola', 'sapato'):  # sapato só engorda para os lados (a sola continua no chão)
            d = Vector((n.x, n.y, 0))
            if abs(n.z) < 0.9 and d.length > 1e-6:
                v.co += d.normalized() * INFLA[r]
        else:
            v.co += n * INFLA[r]
    # tampa cada degrau com uma faixa entre as duas bordas
    for es in pares.values():
        if len(es) != 2:
            continue
        a, c = es
        a0, a1 = a.verts
        c0, c1 = c.verts
        if chave(orig[c0.index]) != chave(orig[a0.index]):
            c0, c1 = c1, c0
        if (a0.co - c0.co).length < 1e-6 and (a1.co - c1.co).length < 1e-6:
            continue
        ra = REGIOES[a.link_faces[0].material_index]
        rc = REGIOES[c.link_faces[0].material_index]
        try:
            nova = bm.faces.new((a0, a1, c1, c0))
        except ValueError:
            continue
        nova.material_index = REGIOES.index(ra if INFLA[ra] >= INFLA[rc] else rc)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    suave(ob)
    return orig

def criar_polegares(feminino=False):
    bm = bmesh.new()
    for s in (-1, 1):
        c = Vector((s * (braco_x(0.782) - 0.004), -0.060, 0.782))
        rot = Matrix.Rotation(-0.55, 3, 'X')
        elipsoide(bm, c, (0.0105, 0.0115, 0.027 if feminino else 0.029), 0, rot, 8, 6)
    ob = novo_objeto('polegares', bm)
    ob.data.materials.append(material('pele'))
    suave(ob)
    return ob

# ---------- Cabelos: casca que abraça o crânio ----------
def linha_cabelo(theta, estilo):
    """phi (a partir do topo) até onde o cabelo desce em cada ângulo: testa alta, têmporas, costeleta, nuca."""
    a = abs(theta)
    testa, tempora, costeleta, nuca = 0.66, 1.02, 1.60, 2.02
    if estilo == 3:
        testa = 0.74
    if a < 0.95:
        return testa + (tempora - testa) * smoothstep(0.25, 0.95, a)
    if a < 1.45:
        return tempora + (costeleta - tempora) * smoothstep(0.95, 1.40, a)
    return costeleta + (nuca - costeleta) * smoothstep(1.50, 2.30, a)

def espessura_cabelo(theta, phi, estilo):
    topo = 1 - smoothstep(0.0, 1.5, phi)
    e = 0.012 + 0.010 * topo
    if estilo == 0:   # repartido lateral: volume no topo, franja varrida para um lado
        e += 0.010 * topo + 0.014 * math.exp(-((theta - 0.45) / 0.55) ** 2) * math.exp(-((phi - 0.62) / 0.35) ** 2)
    elif estilo == 1:  # curto rente
        e = 0.0065 + 0.0035 * topo
    elif estilo == 2:  # cacheado curto
        e += 0.012 + 0.005 * math.sin(theta * 7) * math.sin(phi * 9)
    elif estilo == 3:  # black power
        e += 0.046 * (1 - smoothstep(1.0, 2.0, phi)) + 0.010 + 0.004 * math.sin(theta * 9) * math.sin(phi * 11)
    elif estilo in (4, 5):  # preso (rabo / coque)
        e = 0.008 + 0.005 * topo
    elif estilo == 6:  # chanel
        e += 0.008
    elif estilo == 7:  # ondulado longo
        e += 0.010 + 0.004 * math.sin(theta * 6 + phi * 5)
    elif estilo == 8:  # calvo: só laterais e nuca
        e = 0.0075
    elif estilo == 9:  # topete
        e += 0.020 * math.exp(-(theta / 0.9) ** 2) * math.exp(-((phi - 0.50) / 0.50) ** 2) + 0.006 * topo
    return e

def criar_cabelo(estilo):
    seg, an = 32, 9
    bm = bmesh.new()
    grade = {}
    longo = estilo in (6, 7)
    extra = 5 if longo else 0  # anéis a mais, abaixo da linha do cabelo, nas laterais e atrás
    for i in range(seg):
        theta = 2 * math.pi * i / seg - math.pi
        lim = linha_cabelo(theta, estilo)
        ini = 0.0
        if estilo == 8:  # coroa: começa abaixo do topo
            ini = 0.92 - 0.10 * smoothstep(1.2, 2.6, abs(theta))
            if abs(theta) < 0.80:
                continue  # sem cabelo na frente
        for j in range(an + 1):
            t = j / an
            phi = ini + (lim - ini) * t
            d = dir_esf(theta, max(phi, 1e-3))
            n = cabeca_normal(d)
            borda = min(1.0, (1 - t) / 0.22)
            if longo and abs(theta) > 1.25:
                borda = 1.0  # o comprimento continua para baixo
            e = espessura_cabelo(theta, phi, estilo) * (0.18 + 0.82 * smoothstep(0, 1, borda))
            if estilo == 8:
                e *= 0.25 + 0.75 * smoothstep(0, 0.25, t)
            grade[(i, j)] = bm.verts.new(cabeca_ponto(d) + n * e)
        if longo and abs(theta) > 1.25:
            # mechas caindo: seguem para baixo a partir da linha do cabelo
            d = dir_esf(theta, lim)
            p0 = cabeca_ponto(d) + cabeca_normal(d) * espessura_cabelo(theta, lim, estilo)
            z_fim = 1.445 if estilo == 6 else (1.30 if abs(theta) > 1.9 else 1.432)
            fora = Vector((p0.x, p0.y - 0.004, 0)).normalized()
            for k in range(1, extra + 1):
                t = k / extra
                z = p0.z + (z_fim - p0.z) * t
                abre = (0.010 if estilo == 6 else 0.020) * math.sin(t * math.pi * 0.5)
                onda = 0.006 * math.sin(theta * 5 + t * 7) if estilo == 7 else 0.0
                base = Vector((p0.x, p0.y, z)) + fora * (abre + onda)
                if estilo == 7 and abs(theta) > 1.9:
                    base.y += 0.020 * t  # atrás, encosta nas costas em vez de atravessar o pescoço
                fino = 1.0 if k < extra else 0.86
                grade[(i, an + k)] = bm.verts.new(Vector((base.x * fino, (base.y - 0.004) * fino + 0.004, base.z)))
    linhas = an + extra
    for i in range(seg):
        i2 = (i + 1) % seg
        for j in range(linhas):
            q = [grade.get((i, j)), grade.get((i, j + 1)), grade.get((i2, j + 1)), grade.get((i2, j))]
            if None in q:
                continue
            try:
                bm.faces.new(q)
            except ValueError:
                pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    # Volumes extras
    def bola(c, r, rot=None):
        elipsoide(bm, Vector(c), r, 0, rot, 9, 6)
    topo_p = cabeca_ponto(Vector((0, 0, 1)))
    nuca_p = cabeca_ponto(Vector((0, 1, 0.25)).normalized())
    if estilo == 4:  # rabo de cavalo
        bola(nuca_p + Vector((0, 0.016, 0.020)), (0.024, 0.024, 0.022))
        bola(nuca_p + Vector((0, 0.046, -0.055)), (0.032, 0.028, 0.080), Matrix.Rotation(-0.32, 3, 'X'))
        bola(nuca_p + Vector((0, 0.058, -0.140)), (0.022, 0.020, 0.048), Matrix.Rotation(-0.10, 3, 'X'))
    if estilo == 5:  # coque alto
        bola(topo_p + Vector((0, 0.052, 0.006)), (0.048, 0.048, 0.042))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = novo_objeto(f'cabelo_{estilo}', bm)
    ob.data.materials.append(material('cabelo'))
    suave(ob)
    return ob

# ---------- Barba e acessórios ----------
def faixa_rosto(bm, theta0, theta1, phi_a, phi_b, esp, seg=14, an=6):
    """Casca sobre o rosto entre dois ângulos e duas curvas de phi (funções de theta); afina nas bordas."""
    grade = {}
    for i in range(seg + 1):
        th = theta0 + (theta1 - theta0) * i / seg
        a, c = phi_a(th), phi_b(th)
        for j in range(an + 1):
            phi = a + (c - a) * j / an
            d = dir_esf(th, phi)
            bx = min(i, seg - i) / (seg * 0.18)
            by = min(j, an - j) / (an * 0.30)
            e = esp * (0.15 + 0.85 * min(1.0, bx) * min(1.0, by))
            grade[(i, j)] = bm.verts.new(cabeca_ponto(d) + cabeca_normal(d) * e)
    for i in range(seg):
        for j in range(an):
            bm.faces.new((grade[(i, j)], grade[(i, j + 1)], grade[(i + 1, j + 1)], grade[(i + 1, j)]))

def criar_barba(estilo):
    """1 = barba cheia curta (maxilar + queixo + bigode); 2 = cavanhaque com bigode. A boca fica livre."""
    bm = bmesh.new()
    PI = math.pi
    if estilo == 1:
        # do pé da orelha ao queixo: no meio começa abaixo da boca, dos lados sobe até a costeleta
        cima = lambda th: PI * (0.585 + 0.090 * math.exp(-(th / 0.55) ** 2))
        faixa_rosto(bm, -1.50, 1.50, cima, lambda th: PI * 0.86, 0.0085, 24, 5)
    else:
        faixa_rosto(bm, -0.30, 0.30, lambda th: PI * 0.690, lambda th: PI * (0.835 - 0.05 * (th / 0.30) ** 2), 0.0095, 10, 5)
    # bigode
    faixa_rosto(bm, -0.30, 0.30, lambda th: PI * (0.585 + 0.012 * abs(th) / 0.3), lambda th: PI * (0.630 + 0.012 * abs(th) / 0.3), 0.0075, 10, 4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = novo_objeto(f'barba_{estilo}', bm)
    ob.data.materials.append(material('cabelo'))
    suave(ob)
    return ob

def criar_oculos():
    bm = bmesh.new()
    centros = []
    R = 0.0265
    for lado in (-1, 1):
        d = Vector((lado * 0.37, -1, 0.03)).normalized()
        lateral, cima, n = base_rosto(d)
        c = cabeca_ponto(d) + n * 0.013
        centros.append((c, lateral))
        aro = [c + (lateral * math.cos(2 * math.pi * k / 12) + cima * math.sin(2 * math.pi * k / 12)) * R for k in range(12)]
        tubo(bm, aro + [aro[0]], 0.0026, 0, 4, fechar=False, ref=n)
        orelha = cabeca_ponto(Vector((lado, 0.05, 0.02)).normalized()) + Vector((lado * 0.006, 0, 0.012))
        fora = c + lateral * lado * R
        tubo(bm, [fora, (fora + orelha) / 2 + Vector((lado * 0.006, 0, 0)), orelha], 0.0020, 0, 4)
    # ponte entre as lentes (lateral aponta para +X: borda de dentro de cada aro)
    e_, d_ = centros[0][0] + centros[0][1] * R, centros[1][0] - centros[1][1] * R
    tubo(bm, [e_, (e_ + d_) / 2 + Vector((0, -0.004, 0.004)), d_], 0.0020, 0, 4)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = novo_objeto('oculos', bm)
    ob.data.materials.append(material('acessorio'))
    suave(ob)
    return ob

def criar_fone():
    bm = bmesh.new()
    pts = []
    for i in range(9):
        a = math.pi * i / 8
        d = Vector((math.cos(a), 0.10, math.sin(a))).normalized()
        pts.append(cabeca_ponto(d) + cabeca_normal(d) * 0.036)
    tubo(bm, pts, 0.0065, 0, 5, ref=Vector((0, 1, 0)))
    for lado in (-1, 1):
        c = cabeca_ponto(Vector((lado, 0.08, -0.08)).normalized()) + Vector((lado * 0.016, 0, 0))
        elipsoide(bm, c, (0.016, 0.029, 0.035), 0, None, 8, 5)
    # microfone
    c = cabeca_ponto(Vector((-1, 0.08, -0.08)).normalized()) + Vector((-0.018, 0, -0.012))
    boca_p = cabeca_ponto(Vector((-0.42, -1, -0.50)).normalized()) + Vector((-0.012, -0.018, 0))
    tubo(bm, [c, (c + boca_p) / 2 + Vector((-0.018, -0.006, -0.012)), boca_p], 0.0022, 0, 5)
    elipsoide(bm, boca_p, (0.007, 0.007, 0.007), 0, None, 6, 4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = novo_objeto('fone', bm)
    ob.data.materials.append(material('acessorio'))
    suave(ob)
    return ob

def criar_cracha(corpo_bvh):
    """Crachá pequeno pendurado num cordão em volta do pescoço (a cor do cordão é a do projeto)."""
    bm = bmesh.new()
    def frente(x, z):
        hit = corpo_bvh.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)))
        return hit[0].y if hit[0] is not None else -0.09
    for lado in (-1, 1):
        pts = []
        for k in range(6):
            t = k / 5
            x = lado * (0.050 * (1 - t) + 0.003 * t)
            z = 1.424 - 0.170 * t
            pts.append(Vector((x, frente(x, z) - 0.0035, z)))
        tubo(bm, pts, 0.0030, 1, 4)
    zc = 1.424 - 0.170 - 0.036
    yc = frente(0, zc) - 0.0055
    bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((0, yc, zc)) @ Matrix.Diagonal((0.046, 0.005, 0.062, 1)))
    g2 = bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((0, yc - 0.003, zc + 0.021)) @ Matrix.Diagonal((0.046, 0.002, 0.014, 1)))
    for v in g2['verts']:
        for fc in v.link_faces:
            fc.material_index = 1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = novo_objeto('cracha', bm)
    ob.data.materials.append(material('cracha'))
    ob.data.materials.append(material('cordao'))
    return ob

def criar_gola(corpo_bvh):
    """Gola justa em volta do pescoço: acabamento da blusa."""
    bm = bmesh.new()
    seg = 18
    centro = Vector((0, 0.004, 0))
    def raio(th, z):
        d = Vector((math.sin(th), -math.cos(th), 0))
        o = centro + Vector((0, 0, z))
        hit = corpo_bvh.ray_cast(o + d * 0.4, -d)
        return min(0.085, (hit[0] - o).length) if hit[0] is not None else 0.06
    aneis = []
    for z, extra in ((Z_GOLA - 0.014, 0.0100), (Z_GOLA + 0.004, 0.0125), (Z_GOLA + 0.016, 0.0095), (Z_GOLA + 0.018, 0.0010)):
        anel = []
        for i in range(seg):
            th = 2 * math.pi * i / seg
            r = raio(th, min(z, Z_GOLA + 0.010)) + extra
            anel.append(bm.verts.new(centro + Vector((math.sin(th), -math.cos(th), 0)) * r + Vector((0, 0, z))))
        aneis.append(anel)
    for k in range(len(aneis) - 1):
        for i in range(seg):
            i2 = (i + 1) % seg
            bm.faces.new((aneis[k][i], aneis[k][i2], aneis[k + 1][i2], aneis[k + 1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = novo_objeto('gola', bm)
    ob.data.materials.append(material('gola'))
    suave(ob)
    return ob

# ---------- Esqueleto e pesos ----------
def criar_armadura():
    arm = bpy.data.armatures.new('Esqueleto')
    ob = bpy.data.objects.new('Esqueleto', arm)
    bpy.context.scene.collection.objects.link(ob)
    ativar(ob)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for nome, (pai, pos) in OSSOS.items():
        o = arm.edit_bones.new(nome)
        o.head = b(pos)
        o.tail = b(PONTA[nome])
        eb[nome] = o
    for nome, (pai, _p) in OSSOS.items():
        if pai:
            eb[nome].parent = eb[pai]
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob

def pesos_ponto(x, y, z):
    """Pesos por região, com transição suave nas juntas (determinístico: a malha vem de um grafo conhecido)."""
    ax = abs(x)
    lado = 'left' if x < 0 else 'right'
    outro = 'right' if x < 0 else 'left'
    w = {}
    if e_braco(x, z):
        k = smoothstep(1.015, 1.105, z)  # cotovelo em 1,06
        w[f'{lado}Shoulder'] = k
        w[f'{lado}Elbow'] = 1 - k
    elif z < 0.86:
        sobe = smoothstep(0.72, 0.86, z)  # perto da pelve o peso passa ao quadril
        kj = smoothstep(0.385, 0.475, z)  # joelho em 0,43
        meio = 0.5 * (1 - smoothstep(0.0, 0.030, ax)) if z > 0.60 else 0.0  # virilha: divide entre as pernas
        coxa = kj * (1 - sobe)
        w['hips'] = sobe
        w[f'{lado}Hip'] = coxa * (1 - meio)
        w[f'{outro}Hip'] = coxa * meio
        w[f'{lado}Knee'] = 1 - kj
    else:
        ks = smoothstep(0.96, 1.16, z)  # cintura em 1,06
        kn = smoothstep(1.385, 1.455, z)  # pescoço em 1,42
        kh = smoothstep(1.50, 1.56, z)
        # ombro: da lateral do peito para fora, acima da axila
        ko = smoothstep(SX - 0.085, SX - 0.020, ax) * smoothstep(1.215, 1.275, z) * (1 - kn)
        w['hips'] = 1 - ks
        w['spine'] = ks * (1 - kn) * (1 - ko)
        w[f'{lado}Shoulder'] = ks * (1 - kn) * ko
        w['neck'] = kn * (1 - kh)
        w['head'] = kn * kh
    total = sum(w.values()) or 1
    return {n: v / total for n, v in w.items() if v / total > 1e-3}

def pesos_corpo(ob, orig):
    for nome in OSSOS:
        ob.vertex_groups.new(name=nome)
    for v in ob.data.vertices:
        for nome, valor in pesos_ponto(*orig[v.index]).items():
            ob.vertex_groups[nome].add([v.index], valor, 'REPLACE')

def pesos_rigidos(ob, osso):
    for nome in OSSOS:
        ob.vertex_groups.new(name=nome)
    ob.vertex_groups[osso].add([v.index for v in ob.data.vertices], 1.0, 'REPLACE')

def ligar(ob, arm):
    ob.parent = arm
    m = ob.modifiers.new('Armature', 'ARMATURE')
    m.object = arm

def juntar(objs, nome):
    ativar(objs[0])
    for o in objs:
        o.select_set(True)
    bpy.ops.object.join()
    r = bpy.context.view_layer.objects.active
    r.name = nome
    r.data.name = nome
    return r

def bvh_de(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    t = BVHTree.FromBMesh(bm)
    bm.free()
    return t

def montar():
    """Cria todas as peças, com pesos, ligadas a um esqueleto. Devolve (armadura, dicionário de peças)."""
    arm = criar_armadura()
    pecas = {}
    for genero, f in (('m', False), ('f', True)):
        for manga, curta in (('longa', False), ('curta', True)):
            corpo = criar_corpo(f)
            orig = vestir(corpo, curta)
            pesos_corpo(corpo, orig)
            arvore = bvh_de(corpo)
            partes = [corpo]
            gola = criar_gola(arvore)
            pesos_rigidos(gola, 'spine')
            for v in gola.data.vertices:  # a parte de cima da gola acompanha o pescoço
                if v.co.z > Z_GOLA + 0.008:
                    gola.vertex_groups['neck'].add([v.index], 0.5, 'REPLACE')
                    gola.vertex_groups['spine'].add([v.index], 0.5, 'REPLACE')
            partes.append(gola)
            pol = criar_polegares(f)
            for nome_osso in OSSOS:
                pol.vertex_groups.new(name=nome_osso)
            for v in pol.data.vertices:
                pol.vertex_groups['leftElbow' if v.co.x < 0 else 'rightElbow'].add([v.index], 1.0, 'REPLACE')
            partes.append(pol)
            for criar, osso in ((criar_cabeca, 'head'), (lambda: criar_rosto(f), 'head'), (lambda: criar_cracha(arvore), 'spine')):
                p = criar()
                pesos_rigidos(p, osso)
                partes.append(p)
            nome = f'corpo_{genero}_{manga}'
            peca = juntar(partes, nome)
            ligar(peca, arm)
            pecas[nome] = peca
    extras = [criar_cabelo(e) for e in range(10)] + [criar_barba(1), criar_barba(2), criar_oculos(), criar_fone()]
    for p in extras:
        pesos_rigidos(p, 'head')
        ligar(p, arm)
        p.data.name = p.name
        pecas[p.name] = p
    return arm, pecas

def exportar(caminho):
    for o in bpy.context.scene.objects:
        o.select_set(True)
    props = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    opcoes = dict(filepath=caminho, export_format='GLB', use_selection=False, export_apply=False, export_yup=True,
                  export_skins=True, export_animations=False, export_materials='EXPORT', export_normals=True,
                  export_texcoords=False, export_cameras=False, export_lights=False, export_vertex_color='NONE',
                  export_all_influences=False)
    bpy.ops.export_scene.gltf(**{k: v for k, v in opcoes.items() if k in props})

if __name__ == '__main__':
    bpy.ops.wm.read_factory_settings(use_empty=True)
    arm, pecas = montar()
    for nome, ob in pecas.items():
        ob.data.calc_loop_triangles()
        print(f'PECA {nome}: {len(ob.data.vertices)} vértices, {len(ob.data.loop_triangles)} triângulos')
    os.makedirs(OUT, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'pessoa.blend'))
    exportar(os.path.join(OUT, 'pessoa.glb'))
    print('OK', os.path.getsize(os.path.join(OUT, 'pessoa.glb')), 'bytes')
