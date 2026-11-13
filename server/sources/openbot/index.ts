// Reexporta a API pública do leitor do cadastro OpenBot (db.ts é implementação; nenhum outro
// arquivo é aberto da pasta do OpenBot — chaves e cofre ficam intocados).
export { OpenBotDirectory, readOpenBotAgents, type OpenBotAgent } from './db';
