// Peer-to-peer networking on top of PeerJS (WebRTC data channels).
// The room host is the authority: it holds the single source of truth for the
// game state and broadcasts it to every connected player.
(function () {
  var ROOM_PREFIX = BUNGO.ROOM_PREFIX;
  var COLORS = BUNGO.COLORS;
  var MAX_PLAYERS = BUNGO.MAX_PLAYERS;

  var Net = {
    peer: null,
    isHost: false,
    hostConn: null,       // joiners only: connection to the host
    conns: new Map(),     // host only: playerId -> connection
    youId: null,
    callbacks: null,
    state: null,          // host only
    gameId: null,         // host only
    size: null,           // host only
    joined: false,        // joiner: true once welcome received
    failed: false,        // joiner: true once a fatal error was reported
    joinTimer: null       // joiner: safety timeout id
  };

  function makeCode() {
    var chars = BUNGO.CODE_CHARS;
    var s = "";
    for (var i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  // A unique, valid PeerJS id for joiners (avoids the HTTP id endpoint entirely).
  function makePeerId() {
    return "bungo-p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function nextColor(players) {
    var used = players.map(function (p) { return p.color.hex; });
    for (var i = 0; i < COLORS.length; i++) {
      if (used.indexOf(COLORS[i].hex) < 0) return COLORS[i];
    }
    return null;
  }

  function reject(conn, message) {
    conn.on("open", function () {
      try { conn.send({ type: "error", message: message }); } catch (e) {}
      setTimeout(function () { try { conn.close(); } catch (e) {} }, 400);
    });
    // Safety net: if the channel never opens, close it anyway.
    setTimeout(function () { try { conn.close(); } catch (e) {} }, 4000);
  }

  // Broadcast the current state to all peers and re-render the host's own UI.
  Net.sync = function () {
    var msg = { type: "state", state: Net.state };
    Net.conns.forEach(function (conn) {
      if (conn.open) { try { conn.send(msg); } catch (e) {} }
    });
    if (Net.callbacks && Net.callbacks.onState) Net.callbacks.onState(Net.state);
  };

  // ---------------- Host ----------------
  Net.host = function (gameId, size, name, cb) {
    if (typeof Peer === "undefined") {
      cb.onError("Networking library failed to load. Check your internet connection.");
      return;
    }
    Net.callbacks = cb;
    Net.isHost = true;
    Net.gameId = gameId;
    Net.size = size;
    var attempts = 0;

    function tryCreate() {
      var code = makeCode();
      var peer = new Peer(ROOM_PREFIX + code, { debug: 1 });
      Net.peer = peer;

      peer.on("open", function () {
        var board = BUNGO.generateBoard(BUNGO.getTasks(gameId), size);
        var hostColor = COLORS[0];
        var hostId = peer.id;
        Net.youId = hostId;
        Net.state = {
          code: code,
          gameId: gameId,
          gameName: BUNGO.getGameName(gameId),
          size: size,
          board: board,
          marks: {},
          players: [{ id: hostId, name: (name || "Host").slice(0, 16), color: hostColor, isHost: true, connected: true }],
          winner: null,
          round: 1
        };
        cb.onReady({ code: code, youId: hostId, state: Net.state, isHost: true });
      });

      peer.on("connection", function (conn) { Net.onConnection(conn); });

      peer.on("error", function (err) {
        if (window.console) console.error("[Bungo] host peer error:", err);
        if (err.type === "unavailable-id" && attempts < 5) {
          attempts += 1;
          try { peer.destroy(); } catch (e) {}
          tryCreate();
        } else if (err.type === "unavailable-id") {
          cb.onError("Could not reserve a room code. Please try again.");
        } else if (err.type !== "peer-unavailable") {
          cb.onError("Network error: " + (err.type || err.message || "unknown"));
        }
      });

      peer.on("disconnected", function () {
        if (!peer.destroyed) { try { peer.reconnect(); } catch (e) {} }
      });
    }

    tryCreate();
  };

  Net.onConnection = function (conn) {
    if (Net.state.players.length >= MAX_PLAYERS) {
      reject(conn, "Room is full (8 players max).");
      return;
    }
    var color = nextColor(Net.state.players);
    if (!color) {
      reject(conn, "Room is full (8 players max).");
      return;
    }

    var playerId = conn.peer;
    var player = { id: playerId, name: "Player", color: color, isHost: false, connected: true };
    Net.state.players.push(player);
    Net.conns.set(playerId, conn);

    conn.on("data", function (data) { Net.onData(playerId, data); });
    conn.on("close", function () { Net.onClientClose(playerId); });
    conn.on("error", function (err) {
      // Transient errors (e.g. "not-open-yet") are not fatal; "close" handles cleanup.
      if (window.console) console.warn("[Bungo] connection error:", err && err.type);
    });

    // The data channel is NOT open yet when "connection" fires. Wait for "open"
    // before sending the welcome message, otherwise PeerJS raises "not-open-yet".
    conn.on("open", function () {
      try { conn.send({ type: "welcome", youId: playerId, state: Net.state }); } catch (e) {}
    });

    // Reflect the new player in the host's UI immediately.
    Net.sync();
  };

  Net.onData = function (playerId, data) {
    if (!data) return;
    if (data.type === "hello") {
      var p = Net.state.players.find(function (x) { return x.id === playerId; });
      if (p && data.name) p.name = String(data.name).slice(0, 16);
      Net.sync();
    } else if (data.type === "mark") {
      Net.toggleMark(playerId, Number(data.cellIndex));
    }
  };

  Net.toggleMark = function (playerId, cellIndex) {
    var state = Net.state;
    if (state.winner) return;
    if (cellIndex == null || isNaN(cellIndex) || cellIndex < 0 || cellIndex >= state.board.length) return;
    if (state.board[cellIndex].free) return;

    var list = state.marks[cellIndex] ? state.marks[cellIndex].slice() : [];
    var pos = list.indexOf(playerId);
    if (pos >= 0) list.splice(pos, 1); else list.push(playerId);
    if (list.length === 0) delete state.marks[cellIndex];
    else state.marks[cellIndex] = list;

    if (pos < 0) {
      var bingo = BUNGO.checkBingo(state.board, state.size, state.marks, playerId);
      if (bingo) {
        var p = state.players.find(function (x) { return x.id === playerId; });
        state.winner = {
          playerId: playerId,
          name: p ? p.name : "Player",
          color: p ? p.color : null,
          cells: bingo.cells
        };
      }
    }
    Net.sync();
  };

  Net.onClientClose = function (playerId) {
    Net.conns.delete(playerId);
    Net.state.players = Net.state.players.filter(function (p) { return p.id !== playerId; });
    for (var idx in Net.state.marks) {
      var list = Net.state.marks[idx].filter(function (id) { return id !== playerId; });
      if (list.length === 0) delete Net.state.marks[idx];
      else Net.state.marks[idx] = list;
    }
    if (Net.state.winner && Net.state.winner.playerId === playerId) Net.state.winner = null;
    Net.sync();
  };

  // ---------------- Joiner ----------------
  Net.join = function (code, name, cb) {
    if (typeof Peer === "undefined") {
      cb.onError("Networking library failed to load. Check your internet connection.");
      return;
    }
    Net.callbacks = cb;
    Net.isHost = false;
    Net.joined = false;
    Net.failed = false;
    Net.youId = null;

    // Safety timeout: never leave the user hanging with no feedback.
    clearTimeout(Net.joinTimer);
    Net.joinTimer = setTimeout(function () {
      if (!Net.joined && !Net.failed) {
        Net.failed = true;
        cb.onError("Timed out joining. Check the code and that the host is still online.");
        if (Net.peer) { try { Net.peer.destroy(); } catch (e) {} }
      }
    }, 15000);

    // Use an explicit random id (like the host does) so joining never depends
    // on the server's HTTP id endpoint, which some browsers/extensions block.
    var peer = new Peer(makePeerId(), { debug: 1 });
    Net.peer = peer;

    peer.on("open", function () {
      var conn = peer.connect(ROOM_PREFIX + code.toUpperCase(), { reliable: true, serialization: "json" });
      Net.hostConn = conn;

      conn.on("open", function () {
        try { conn.send({ type: "hello", name: (name || "Player").slice(0, 16) }); } catch (e) {}
      });
      conn.on("data", function (data) { Net.handleServerMessage(data); });
      conn.on("close", function () {
        if (Net.joined) {
          cb.onRoomClosed();
        } else if (!Net.failed) {
          Net.failed = true;
          clearTimeout(Net.joinTimer);
          cb.onError("Could not connect to the room.");
          try { peer.destroy(); } catch (e) {}
        }
      });
      conn.on("error", function (err) {
        // A real failure also emits "close", which handles cleanup.
        if (window.console) console.warn("[Bungo] connection error:", err && err.type);
      });
    });

    peer.on("error", function (err) {
      if (Net.failed) return;
      Net.failed = true;
      clearTimeout(Net.joinTimer);
      if (window.console) console.error("[Bungo] peer error:", err);
      if (err.type === "peer-unavailable") {
        cb.onError("Room not found. Check the code and try again.");
      } else {
        cb.onError("Network error: " + (err.type || err.message || "unknown"));
      }
      try { peer.destroy(); } catch (e) {}
    });

    peer.on("disconnected", function () {
      if (!peer.destroyed) { try { peer.reconnect(); } catch (e) {} }
    });
  };

  Net.handleServerMessage = function (data) {
    if (!data) return;
    if (data.type === "welcome") {
      clearTimeout(Net.joinTimer);
      Net.joined = true;
      Net.youId = data.youId;
      if (Net.callbacks && Net.callbacks.onWelcome) Net.callbacks.onWelcome(data.state, data.youId);
    } else if (data.type === "state") {
      if (Net.callbacks && Net.callbacks.onState) Net.callbacks.onState(data.state);
    } else if (data.type === "error") {
      clearTimeout(Net.joinTimer);
      Net.failed = true;
      if (Net.callbacks && Net.callbacks.onError) Net.callbacks.onError(data.message);
    }
  };

  // ---------------- Shared actions ----------------
  Net.mark = function (cellIndex) {
    if (Net.isHost) {
      Net.toggleMark(Net.youId, cellIndex);
    } else if (Net.hostConn && Net.hostConn.open) {
      try { Net.hostConn.send({ type: "mark", cellIndex: cellIndex }); } catch (e) {}
    }
  };

  Net.newRound = function () {
    if (!Net.isHost || !Net.state) return;
    Net.state.board = BUNGO.generateBoard(BUNGO.getTasks(Net.gameId), Net.size);
    Net.state.marks = {};
    Net.state.winner = null;
    Net.state.round += 1;
    Net.sync();
  };

  Net.leave = function () {
    clearTimeout(Net.joinTimer);
    if (Net.peer) { try { Net.peer.destroy(); } catch (e) {} }
    Net.peer = null;
    Net.conns.clear();
    Net.hostConn = null;
    Net.state = null;
    Net.isHost = false;
    Net.youId = null;
    Net.joined = false;
    Net.failed = false;
    Net.callbacks = null;
  };

  BUNGO.Net = Net;
})();
