# Bungo

A serverless, dependency-free bingo game to play alongside a video game.
Players complete tasks in the game, mark them on a shared bingo card, and race
to a full line. There is **no server and no third-party library** — connections
are made with the browser's native WebRTC APIs.

## Run it

Open `index.html` in a browser (double-click it). No build step, no backend.

## How to play

1. **Create a room** — pick a video game and a bingo card size (3×3, 5×5, or 7×7).
2. As host, click **＋ Add player** to generate a **join invite**. Copy it and
   send it to a friend (any chat, email, or SMS works).
3. The friend pastes the invite on the **Join room** screen, which produces an
   **answer** for them to copy and send back to you.
4. Paste their answer into that invite and click **Connect**. They appear in
   the room instantly. Repeat for up to 8 players.
5. Everyone shares the same card with a FREE center. Each player has a unique
   color; click a task to mark it (the cell's background turns that color). The
   first to a full row, column, or diagonal wins.

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

1. Add `data/games/<id>.json` with `{ "id", "name", "tasks": [...] }`.
2. Add the id to `BUNGO.GAME_IDS` in `js/game-data.js`.
3. If you open the app via `file://`, also mirror the data into
   `BUNGO.GAMES_FALLBACK` in the same file (served over HTTP it fetches the JSON).
