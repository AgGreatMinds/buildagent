#!/usr/bin/env node
// Tap de uso do Claude Code: a statusline recebe em stdin um JSON com `rate_limits` (janelas de 5 h e
// semana da conta). Este script grava esse uso em ~/.buildagent/usage/<conta>.json (formato lido por
// server/accounts/statusline.ts) e depois roda a statusline ORIGINAL do usuário com o mesmo stdin,
// então a barra do Claude Code continua igual. Não lê credenciais, não usa rede, e qualquer falha
// aqui é engolida: a statusline original sempre roda e o exit code é sempre 0.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

const home = homedir();
const pasta = process.env.BUILDAGENT_USAGE_DIR?.trim() || join(home, '.buildagent', 'usage');
const arquivoOriginal = join(home, '.buildagent', 'statusline-original.txt');

let entrada = '';
try { entrada = readFileSync(0, 'utf8'); } catch { /* sem stdin: roda a original vazia */ }

/** Janela no formato do Claude Code → o que o leitor espera ({utilization 0-100, resets_at em segundos}). */
function janela(j) {
  if (!j || typeof j !== 'object') return undefined;
  const u = Number(j.used_percentage ?? j.utilization);
  if (!Number.isFinite(u)) return undefined;
  const r = Number(j.resets_at ?? j.resetsAt);
  return Number.isFinite(r) ? { utilization: u, resets_at: r } : { utilization: u };
}

/** E-mail da conta logada numa pasta de config (só esse campo do .claude.json é lido). */
function emailDe(dir) {
  for (const f of [join(dir, '.claude.json'), dir === join(home, '.claude') ? join(home, '.claude.json') : '']) {
    if (!f) continue;
    try { const e = JSON.parse(readFileSync(f, 'utf8'))?.oauthAccount?.emailAddress; if (typeof e === 'string' && e) return e; } catch { /* tenta o próximo */ }
  }
  return undefined;
}

try {
  const rl = JSON.parse(entrada)?.rate_limits;
  const five_hour = janela(rl?.five_hour);
  const seven_day = janela(rl?.seven_day);
  if (five_hour || seven_day) {
    let configDir = process.env.CLAUDE_CONFIG_DIR?.trim() || join(home, '.claude');
    // Cota é da assinatura, não da pasta: outra pasta de config logada no MESMO e-mail (ex.: ~/.claude-conta2)
    // grava no arquivo da conta padrão (~/.claude), onde o servidor e a lista a procuram.
    const padrao = join(home, '.claude');
    if (configDir !== padrao && emailDe(configDir) && emailDe(configDir) === emailDe(padrao)) configDir = padrao;
    const accountId = basename(configDir);
    mkdirSync(pasta, { recursive: true });
    const destino = join(pasta, `${accountId}.json`);
    const tmp = `${destino}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ accountId, configDir, fetchedAt: Date.now(), ...(five_hour && { five_hour }), ...(seven_day && { seven_day }) }));
    renameSync(tmp, destino); // troca atômica: o servidor nunca lê arquivo pela metade
  }
} catch { /* nunca atrapalha a statusline */ }

let original = '';
try { original = readFileSync(arquivoOriginal, 'utf8').trim(); } catch { /* ainda sem original salva */ }
if (original) {
  const r = spawnSync('/bin/sh', ['-c', original], { input: entrada, encoding: 'utf8', timeout: 4000 });
  process.stdout.write(r.stdout ?? '');
}
process.exit(0);
