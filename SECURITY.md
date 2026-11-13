# Segurança

## O que o BuildAgent faz e não faz

- **Somente leitura.** Lê os arquivos de sessão que as ferramentas de agente já gravam no seu computador.
  Não escreve nas pastas dos agentes nem nos projetos.
- **Nada sai da máquina.** O servidor não faz requisição para fora; não há telemetria.
- **Escuta só em `127.0.0.1` por padrão.** Trocar `HABBLAUD_HOST` expõe o painel na rede local **sem
  senha** — o servidor avisa ao iniciar. Faça isso apenas numa rede em que você confia.
- **Uma pasta de escrita.** Estatísticas do dia e linha do tempo ficam em `HABBLAUD_DATA_DIR`
  (padrão `~/.habblaud`).
- **Modo demonstração isolado.** Com `--demo`, nenhuma sessão, conta ou histórico real é lido, e o que é
  gravado vai para uma subpasta `demo/`.
- **OpenBot.** Só o cadastro (nome, cargo e pasta de cada agente) é lido, em modo somente leitura.
  Cofres, chaves e conversas não são abertos.

## O que aparece na tela

Nomes de projeto, caminhos de pasta, o tipo de atividade de cada agente e o título da sessão (que
costuma ser o começo do seu pedido) aparecem no painel. A API local também carrega o comando e o arquivo
em uso, o nome do autor dos commits de cada projeto e, de cada conta detectada, o e-mail, a organização e
o caminho da pasta de configuração. Chaves, tokens e senhas reconhecidos são mascarados
antes de sair do servidor; o texto das respostas dos agentes não é enviado à tela.

Antes de compartilhar a tela ou gravar vídeo, prefira o modo demonstração.

## Avisar de uma falha

Não abra issue pública para vulnerabilidade. Use **Security → Report a vulnerability** no repositório do
GitHub (aviso privado). Conte o que acontece, como reproduzir e a versão. A resposta vem pelo próprio aviso.

Versões cobertas: a mais recente publicada.
