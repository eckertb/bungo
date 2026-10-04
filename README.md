# Bungo

A serverless, dependency-free bingo game to play alongside a video game.
Players complete tasks in the game, mark them on a shared bingo card, and race
to a full line. There is **no server and no third-party library** — players
connect with the browser's native WebRTC APIs.

## Run it

Open `index.html` in a browser (double-click it). No build step, no backend.

## How to play

### Host

1. **Create a room** — pick a video game (Super Mario 64 or Dark Souls) and a
   bingo card size (3×3, 5×5, or 7×7).
2. Click **Invite players** in the top-right to open the invite modal, then
   click **＋ Add player** to create an invite.
3. Copy the **invite** code and send it to a friend (any chat, email, or SMS
   works).
4. When they reply with an **answer** code, paste it into that invite's answer
   box and click **Connect**. They join instantly. Repeat for up to 8 players.

### Joiner

1. Click **Join room**, paste the **invite** the host sent you, and enter your
   name.
2. The app produces an **answer** code — copy it and send it back to the host.
3. The room opens automatically once the host connects you.

### Playing

- Everyone shares the same card, with a FREE space in the middle.
- Each player gets a **random unique color**. Click a task to mark it — the
  cell's background turns your color (when several players mark the same cell,
  it splits into colored segments).
- The first player to complete a full row, column, or diagonal wins (the FREE
  center counts for everyone).

> The invite/answer strings are SDP blobs that only describe how to reach the
> host. They carry no game data and are useless once the room ends.

## How it works

- **Host = authority.** The host generates the board and broadcasts the game
  state to everyone over an `RTCDataChannel` (DTLS-encrypted, peer to peer).
- **Manual signaling.** Instead of a signaling server, the SDP offer/answer is
  exchanged by copy/paste. That tradeoff is what lets the app run with no
  server and no library.
- **STUN only.** Public STUN servers (just URLs in the config) help peers
  behind NAT connect. No TURN relay is used, so a few very restrictive NATs
  may not connect. Same-network play works without STUN.

## Project layout

```
index.html
css/styles.css
js/config.js            # constants: colors, max players
js/game-data.js         # game registry + loader
js/game.js              # board generation + bingo detection
js/network.js           # native WebRTC: manual signaling + data channels
js/app.js               # UI wiring and rendering
data/games/*.json       # tasks per video game
```

## Adding a game

1. Add `data/games/<id>.json` with `{ "id", "name", "tasks": [...] }` (a 7×7
   board needs at least 48 tasks).
2. Add the id to `BUNGO.GAME_IDS` in `js/game-data.js`.
3. If you open the app via `file://`, also mirror the data into
   `BUNGO.GAMES_FALLBACK` in the same file (served over HTTP it fetches the JSON).
