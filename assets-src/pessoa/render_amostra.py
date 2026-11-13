# Renderiza uma fileira de pessoas de amostra a partir de pessoa.blend (só para conferir o modelo).
# Blender -b pessoa.blend -P render_amostra.py -- --out <png> [--vista frente|tres|costas|perto]
import bpy, math, sys, os
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(nome, padrao=None):
    return ARGS[ARGS.index(nome) + 1] if nome in ARGS else padrao
OUT = arg('--out', '/tmp/amostra.png')
VISTA = arg('--vista', 'frente')

def hexcor(h):
    def lin(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin((h >> 16) & 255), lin((h >> 8) & 255), lin(h & 255), 1)

PESSOAS = [
    dict(corpo='corpo_m_longa', cabelo=0, pele=0xd9a07a, blusa=0x29496f, calca=0x2b2e36, sapato=0x1b1b1d, cabeloc=0x34251b, cordao=0xf26b21),
    dict(corpo='corpo_f_longa', cabelo=6, pele=0xf1c8a5, blusa=0xad7885, calca=0x4b4d58, sapato=0x3a2a22, cabeloc=0x68472b, cordao=0x2f80ed),
    dict(corpo='corpo_m_curta', cabelo=3, pele=0x6b4129, blusa=0xe9e5db, calca=0x315f57, sapato=0xd8d4c7, cabeloc=0x111216, cordao=0x27ae60, barba=1),
    dict(corpo='corpo_f_curta', cabelo=4, pele=0xb97b56, blusa=0x315f57, calca=0x2b2e36, sapato=0x1b1b1d, cabeloc=0x181412, cordao=0xf26b21, oculos=True),
    dict(corpo='corpo_m_longa', cabelo=8, pele=0xffdbc1, blusa=0x743f4e, calca=0x82652f, sapato=0x3a2a22, cabeloc=0xaaa7a0, cordao=0x9b51e0, barba=2, oculos=True),
    dict(corpo='corpo_f_longa', cabelo=7, pele=0x8d5a3c, blusa=0x82652f, calca=0x29496f, sapato=0x1b1b1d, cabeloc=0x34251b, cordao=0x2f80ed, fone=True),
    dict(corpo='corpo_m_curta', cabelo=9, pele=0xa36c4e, blusa=0x52758a, calca=0x4b4d58, sapato=0xd8d4c7, cabeloc=0x68472b, cordao=0x27ae60),
    dict(corpo='corpo_f_curta', cabelo=5, pele=0xf1c8a5, blusa=0x59436f, calca=0xb5a58e, sapato=0x3a2a22, cabeloc=0xa58352, cordao=0xf26b21),
    dict(corpo='corpo_m_longa', cabelo=2, pele=0x503326, blusa=0x667b59, calca=0x2b2e36, sapato=0x1b1b1d, cabeloc=0x111216, cordao=0x9b51e0, fone=True),
    dict(corpo='corpo_m_curta', cabelo=1, pele=0xd9a07a, blusa=0xc79d98, calca=0x29496f, sapato=0x1b1b1d, cabeloc=0x754332, cordao=0x2f80ed),
]

def bsdf(m):
    return next(n for n in m.node_tree.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled')

originais = {o.name: o for o in bpy.data.objects if o.type == 'MESH'}
for o in originais.values():
    o.hide_render = True

def copia(nome, x, cores):
    src = originais[nome]
    ob = src.copy()
    ob.data = src.data.copy()
    ob.hide_render = False
    bpy.context.scene.collection.objects.link(ob)
    ob.location.x = x
    for i, slot in enumerate(ob.material_slots):
        base = slot.material
        chave = {'pele': 'pele', 'blusa': 'blusa', 'calca': 'calca', 'sapato': 'sapato', 'cabelo': 'cabeloc', 'sobrancelha': 'cabeloc', 'cordao': 'cordao'}.get(base.name.split('.')[0])
        if chave and chave in cores:
            m = base.copy()
            c = hexcor(cores[chave])
            if base.name.startswith('sobrancelha'):
                c = (c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, 1)
            bsdf(m).inputs['Base Color'].default_value = c
            ob.material_slots[i].material = m
    return ob

n = len(PESSOAS)
passo = 0.62
for i, p in enumerate(PESSOAS):
    x = (i - (n - 1) / 2) * passo
    copia(p['corpo'], x, p)
    copia(f"cabelo_{p['cabelo']}", x, p)
    if p.get('barba'):
        copia(f"barba_{p['barba']}", x, p)
    if p.get('oculos'):
        copia(next(k for k in originais if k.startswith('oculos')), x, p)
    if p.get('fone'):
        copia('fone', x, p)

# chão
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
chao = bpy.context.active_object
mc = bpy.data.materials.new('chao')
mc.use_nodes = True
bsdf(mc).inputs['Base Color'].default_value = (0.62, 0.64, 0.67, 1)
chao.data.materials.append(mc)

# luz
sol = bpy.data.objects.new('Sol', bpy.data.lights.new('Sol', 'SUN'))
sol.data.energy = 3.2
sol.data.angle = math.radians(12)
sol.rotation_euler = (math.radians(52), 0, math.radians(-32))
bpy.context.scene.collection.objects.link(sol)
mundo = bpy.data.worlds.new('Mundo')
mundo.use_nodes = True
fundo = next(n for n in mundo.node_tree.nodes if n.bl_idname == 'ShaderNodeBackground')
fundo.inputs[0].default_value = (0.78, 0.83, 0.90, 1)
fundo.inputs[1].default_value = 0.9
bpy.context.scene.world = mundo

cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
bpy.context.scene.collection.objects.link(cam)
bpy.context.scene.camera = cam
def mirar(pos, alvo, lente):
    cam.location = pos
    d = Vector(alvo) - Vector(pos)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lente
if VISTA == 'frente':
    mirar((0, -9.5, 1.25), (0, 0, 0.92), 62)
elif VISTA == 'tres':
    mirar((5.2, -7.6, 2.3), (0, 0, 0.9), 62)
elif VISTA == 'costas':
    mirar((0, 9.5, 1.25), (0, 0, 0.92), 62)
elif VISTA == 'perto':
    mirar((-0.9, -2.6, 1.55), (-0.9, 0, 1.38), 60)
elif VISTA == 'lado':
    mirar((-9, -0.3, 1.2), (0, 0, 0.92), 150)

cena = bpy.context.scene
cena.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in type(cena.render).bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE_NEXT'
cena.render.resolution_x = int(arg('--w', '1800'))
cena.render.resolution_y = int(arg('--h', '820'))
cena.render.film_transparent = False
cena.view_settings.view_transform = 'Standard'
cena.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('RENDER', OUT)
