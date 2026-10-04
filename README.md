# Bungo

A peer-to-peer bingo game to play alongside a video game. Players complete
tasks in the game, mark them on a shared bingo card, and race to a full line.

## Run it

Just open `index.html` in a browser (double-click it). There's no build step
and no backend to run.

An internet connection is needed for two things:

1. The PeerJS library (loaded from a CDN).
2. WebRTC signaling through PeerJS's free public cloud broker (`0.peerjs.com`).

All game data (the board, marks, player list) flows directly between browsers
over WebRTC data channels — the broker is only used to help peers find each
other.

## How to play

1. **Create a room** — pick a video game and a bingo card size (3×3, 5×5, or
   7×7). You'll get a 4-character room code.
2. Share the code. Up to 8 players can **join a room** with the code.
3. Everyone sees the **same** bingo card, with a FREE space in the middle.
4. Each player gets a unique color token. Click a task to place (or remove)
   your token. Marks sync to everyone in real time.
5. The first player to complete a full row, column, or diagonal (the FREE
   space counts for everyone) wins.

## Project layout

```
index.html              # markup only
css/styles.css          # styles only
js/config.js            # constants: colors, room prefix, max players
js/game-data.js         # game registry + embedded fallback data + loader
js/game.js              # board generation + bingo detection
js/network.js           # PeerJS host/join logic and message protocol
js/app.js               # UI wiring and rendering
data/games/mario64.json # tasks per video game (one JSON file per game)
```

## Adding a new video game

1. Add `data/games/<id>.json` with the shape:
   ```json
   { "id": "zelda-oot", "name": "Ocarina of Time", "tasks": ["...", "..."] }
   ```
2. Add the id to `BUNGO.GAME_IDS` in `js/game-data.js`.
3. If you open the app via `file://` (rather than a static server), also mirror
   the same data into `BUNGO.GAMES_FALLBACK` in `js/game-data.js`.

   When served over HTTP the JSON files are fetched directly; on `file://`
   browsers block `fetch`, so the embedded fallback copy is used instead.
