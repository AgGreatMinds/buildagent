# BuildAgent

**A 3D building that shows, in real time, what your AI agents are doing.**
Each agent becomes a person: walks in through the door, takes the elevator, sits at the project's desk,
works, asks for your attention when it needs you, and leaves when it is done.

[Português](README.md) · [Architecture (pt-BR)](docs/ARQUITETURA.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

![The building from outside](docs/img/predio.png)
![Work floor: one row of desks per project](docs/img/andar.png)

## What it reads

BuildAgent **only reads** files that the tools already write on your computer. It sends nothing out,
asks for no API key, and never writes into agent folders.

| Tool | Source | Turn off |
|---|---|---|
| Claude Code | `~/.claude` (and other account folders) | — |
| Codex | `~/.codex` | `HABBLAUD_CODEX=0` |
| OpenCode | local OpenCode database | `HABBLAUD_OPENCODE=0` |
| Pi | `~/.pi/agent/sessions` | `HABBLAUD_PI=0` |
| OpenBot | local registry (agent name, role and folder only) | `HABBLAUD_OPENBOT=0` |

Conversation text is not copied to the screen: each speech bubble shows the state and the kind of
activity ("editing", "running tests"). The panels show project name, folder and the session title (usually
the start of your request); the local API also carries the command and file in use, with secrets masked.
Details in [SECURITY.md](SECURITY.md).

## Getting started

Requires **Node.js 22.13 or newer** (the project uses Node's built-in SQLite).

```bash
git clone https://github.com/AgGreatMinds/buildagent.git
```

```bash
cd buildagent && npm install
```

```bash
npm run build && npm start
```

Open `http://127.0.0.1:4750`. A single port serves both the interface and the data.

### Just show me

```bash
npm run build && npm run demo
```

Demo mode uses fictional agents and **reads no real session** — good for testing, recording a video or
showing the project without exposing what you are working on.

### Development

Two terminals: the server (`npm run dev`, port 4750) and the interface with hot reload
(`npm run dev:client`, port 5750). `npm test` and `npm run typecheck` must pass.

## Controls

| Key | Action |
|---|---|
| `1` | Building overview |
| `2` | Entrance |
| `3` | Work floor (desks per project) |
| `4` | City |
| `5` | Ground floor (reception and elevators) |
| `6` | Work floor, lounge side |
| `7` / `8` | Rooftop, outside and inside |
| `↑` `↓` | Floor up / down |
| `d` | Slow orbit camera |
| drag / wheel | Rotate and zoom (zoom goes where the cursor points) |

Click a person (or the list on the left) to open the agent's details. Double-click follows the person.

## Light by design

- Hidden tab: nothing is drawn.
- Nobody in view: about one frame per second; people walking: 30.
- Zoomed into the building, the city stops: cars and lights only animate with the camera far away.
- Quality adapts to the machine (shadows, resolution, monitor screens).

Add `?perf=1` to the address to see frames per second, draw calls and the current level.

## Configuration

All through environment variables, none required. (The `HABBLAUD_` prefix comes from the project this
one was ported from — see [NOTICE.md](NOTICE.md).) See the table in the [Portuguese README](README.md#configurar)
and the template in [`.env.example`](.env.example): export the variables in your shell, or copy the template
to `.env` at the project root — `npm start`, `npm run demo` and `npm run dev` load it automatically.

**`HABBLAUD_HOST` other than `127.0.0.1` exposes the panel on your local network with no password.**

## Live account usage (optional)

The "Accounts · usage" strip shows what Claude Code already cached (it refreshes when you run `/usage`).
To have the numbers follow the session, set `scripts/statusline-uso.mjs` as Claude Code's statusline in
`~/.claude/settings.json`:

```json
{ "statusLine": { "type": "command", "command": "node /path/to/buildagent/scripts/statusline-uso.mjs" } }
```

It only writes the usage percentage to `~/.habblaud/usage/` — no credentials, no network. If you already have
a statusline, put its command in `~/.habblaud/statusline-original.txt`: the script runs it afterwards, so your
bar stays the same.

## Make it yours

Create `client/public/local/` (kept out of git) with:

- `predio.json` — `{ "nome": "MY COMPANY" }` changes the sign on the façade (up to 20 letters, no accents).
- `logo.svg` — becomes the embossed logo on the façade and in the reception.
- `simbolo.svg` — replaces the panel glyph (top bar and list header) with your own mark.
- `fonts/GeneralSans-Variable.woff2` — optional: the panel's body font. It is not in the repository (its license
  does not allow redistribution); get it at [fontshare.com](https://www.fontshare.com/fonts/general-sans). Without
  it, the panel uses the system font.

Then run `npm run build` again.

## Known limits

- People walk along fixed corridors and step aside when crossing each other, but there is no free-route
  obstacle avoidance: an occasional bump can still happen at rush hour.
- The OpenBot registry is read from the default macOS path; elsewhere, set `HABBLAUD_OPENBOT_DB`.
- The interface, code comments and most documentation are in Brazilian Portuguese.

## Credits and license

MIT — see [LICENSE](LICENSE). Part of the server was ported from
[Habblaud](https://github.com/marmottajr/habblaud) (MIT); credits and the file list are in
[NOTICE.md](NOTICE.md) and [LICENSE-HABBLAUD](LICENSE-HABBLAUD). Third-party 3D models and fonts are listed
there too.
