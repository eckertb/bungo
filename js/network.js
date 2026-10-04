// Serverless, dependency-free peer-to-peer networking using the browser's
// native WebRTC APIs. There is no signaling server and no library: the host
// and each player exchange a "join invite" and an "answer" (SDP blobs) out of
// band via copy/paste. Once connected, game data flows over an RTCDataChannel.
(function () {
  var COLORS = BUNGO.COLORS;
  var MAX_PLAYERS = BUNGO.MAX_PLAYERS;

  // Public STUN servers (configuration only — not a library). They help peers
  // behind NAT punch through; they never see application data. No TURN server
  // is used, so a small number of very restrictive NATs may not connect.
  var ICE_SERVERS = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }
  ];

  var Net = {
    isHost: false,
    state: null,        // host only
    gameId: null,       // host only
    size: null,         // host only
    conns: new Map(),   // host only: playerId -> RTCDataChannel
    invites: new Map(), // host only: inviteId -> { id, pc, channel, playerId, resolved }
    youId: null,
    callbacks: null,
    joined: false,      // joiner
    failed: false,      // joiner
    pc: null,           // joiner
    channel: null       // joiner
  };

  var inviteCounter = 0;
  function nextInviteId() { inviteCounter += 1; return "inv" + inviteCounter; }
  function makePlayerId() { return "p" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10); }

  // ---------------- SDP encoding (compact + compressed) ----------------
  function b64encode(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function b64decode(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  function encodeSession(desc) {
    var json = JSON.stringify({ t: desc.type, s: desc.sdp });
    if (typeof CompressionStream === "function") {
      try {
        var cs = new CompressionStream("deflate-raw");
        var blob = new Blob([json]).stream().pipeThrough(cs);
        return new Response(blob).arrayBuffer().then(function (buf) {
          return "c." + b64encode(new Uint8Array(buf));
        });
      } catch (e) { /* fall back to plain JSON below */ }
    }
    return Promise.resolve("j." + json);
  }
  function decodeSession(str) {
    str = (str || "").trim();
    if (!str) return Promise.reject(new Error("empty invite/answer"));
    if (str.slice(0, 2) === "c.") {
      var bytes = b64decode(str.slice(2));
      var ds = new DecompressionStream("deflate-raw");
      var out = new Blob([bytes]).stream().pipeThrough(ds);
      return new Response(out).text().then(function (json) {
        var obj = JSON.parse(json);
        return { type: obj.t, sdp: obj.s };
      });
    }
    if (str.slice(0, 2) === "j.") {
      var obj2 = JSON.parse(str.slice(2));
      return Promise.resolve({ type: obj2.t, sdp: obj2.s });
    }
    // Bare SDP fallback (assume it's an offer).
    return Promise.resolve({ type: "offer", sdp: str });
  }

  // ---------------- Small helpers ----------------
  function send(channel, msg) {
    if (channel && channel.readyState === "open") {
      try { channel.send(JSON.stringify(msg)); } catch (e) {}
    }
  }
  function parseData(data) {
    try { return JSON.parse(data); } catch (e) { return null; }
  }
  function nextColor(players) {
    var used = players.map(function (p) { return p.color.hex; });
    for (var i = 0; i < COLORS.length; i++) {
      if (used.indexOf(COLORS[i].hex) < 0) return COLORS[i];
    }
    return null;
  }
  function waitIceComplete(pc) {
    return new Promise(function (resolve) {
      var done = false;
      function finish() { if (!done) { done = true; resolve(); } }
      if (pc.iceGatheringState === "complete") { finish(); return; }
      pc.onicecandidate = function (ev) { if (!ev.candidate) finish(); };
      pc.onicegatheringstatechange = function () {
        if (pc.iceGatheringState === "complete") finish();
      };
      setTimeout(finish, 10000); // never hang forever on odd networks
    });
  }

  // ---------------- State sync ----------------
  Net.sync = function () {
    var msg = { type: "state", state: Net.state };
    Net.conns.forEach(function (ch) { send(ch, msg); });
    if (Net.callbacks && Net.callbacks.onState) Net.callbacks.onState(Net.state);
  };

  // ---------------- Host ----------------
  Net.host = function (gameId, size, name, cb) {
    Net.callbacks = cb;
    Net.isHost = true;
    Net.gameId = gameId;
    Net.size = size;
    var hostId = "host";
    Net.youId = hostId;
    Net.state = {
      gameId: gameId,
      gameName: BUNGO.getGameName(gameId),
      size: size,
      board: BUNGO.generateBoard(BUNGO.getTasks(gameId), size),
      marks: {},
      players: [{ id: hostId, name: (name || "Host").slice(0, 16), color: COLORS[0], isHost: true, connected: true }],
      winner: null,
      round: 1
    };
    cb.onReady({ youId: hostId, state: Net.state, isHost: true });
  };

  // Creates a pending connection and returns { id, invite }.
  Net.createInvite = function () {
    return new Promise(function (resolve, reject) {
      if (Net.state.players.length >= MAX_PLAYERS) {
        reject(new Error("Room is full (8 players max)."));
        return;
      }
      var pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      var channel = pc.createDataChannel("bungo", { ordered: true });
      var invite = { id: nextInviteId(), pc: pc, channel: channel, playerId: null, resolved: false };
      Net.invites.set(invite.id, invite);

      channel.onopen = function () { Net.onChannelOpen(invite); };
      channel.onclose = function () {
        if (invite.playerId) Net.onClientClose(invite.playerId);
        Net.invites.delete(invite.id);
      };
      channel.onmessage = function (ev) {
        var data = parseData(ev.data);
        if (invite.playerId) Net.onData(invite.playerId, data);
      };

      pc.createOffer()
        .then(function (offer) { return pc.setLocalDescription(offer); })
        .then(function () { return waitIceComplete(pc); })
        .then(function () { return encodeSession(pc.localDescription); })
        .then(function (str) { resolve({ id: invite.id, invite: str }); })
        .catch(function (e) { Net.invites.delete(invite.id); reject(e); });
    });
  };

  // Accepts the answer the joiner pasted back; the channel opens on both sides.
  Net.acceptAnswer = function (inviteId, answerStr) {
    var invite = Net.invites.get(inviteId);
    if (!invite) return Promise.reject(new Error("That invite no longer exists."));
    return decodeSession(answerStr).then(function (desc) {
      return invite.pc.setRemoteDescription(desc);
    });
  };

  Net.discardInvite = function (inviteId) {
    var inv = Net.invites.get(inviteId);
    if (!inv) return;
    Net.invites.delete(inviteId);
    try { inv.channel.close(); } catch (e) {}
    try { inv.pc.close(); } catch (e) {}
    if (inv.playerId) Net.onClientClose(inv.playerId);
  };

  Net.onChannelOpen = function (invite) {
    if (invite.resolved) return;
    var color = nextColor(Net.state.players);
    if (Net.state.players.length >= MAX_PLAYERS || !color) {
      send(invite.channel, { type: "error", message: "Room is full (8 players max)." });
      setTimeout(function () { try { invite.channel.close(); } catch (e) {} }, 500);
      return;
    }
    invite.resolved = true;
    var playerId = makePlayerId();
    invite.playerId = playerId;
    var player = { id: playerId, name: "Player", color: color, isHost: false, connected: true };
    Net.state.players.push(player);
    Net.conns.set(playerId, invite.channel);

    send(invite.channel, { type: "welcome", youId: playerId, state: Net.state });
    Net.sync();
    if (Net.callbacks && Net.callbacks.onInviteConnected) Net.callbacks.onInviteConnected(invite.id, player);
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
  Net.join = function (inviteStr, name, cb) {
    Net.callbacks = cb;
    Net.isHost = false;
    Net.joined = false;
    Net.failed = false;
    Net.youId = null;

    var pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    Net.pc = pc;

    pc.ondatachannel = function (ev) {
      var channel = ev.channel;
      Net.channel = channel;
      channel.onopen = function () {
        send(channel, { type: "hello", name: (name || "Player").slice(0, 16) });
      };
      channel.onmessage = function (ev) { Net.handleServerMessage(parseData(ev.data)); };
      channel.onclose = function () {
        if (Net.joined) cb.onRoomClosed();
        else if (!Net.failed) { Net.failed = true; cb.onError("The connection closed before joining."); }
      };
    };

    decodeSession(inviteStr)
      .then(function (desc) { return pc.setRemoteDescription(desc); })
      .then(function () { return pc.createAnswer(); })
      .then(function (answer) { return pc.setLocalDescription(answer); })
      .then(function () { return waitIceComplete(pc); })
      .then(function () { return encodeSession(pc.localDescription); })
      .then(function (answerStr) { cb.onAnswerReady(answerStr); })
      .catch(function (e) {
        if (!Net.failed) {
          Net.failed = true;
          cb.onError("Could not process the invite: " + (e && e.message ? e.message : e));
        }
      });
  };

  Net.handleServerMessage = function (data) {
    if (!data) return;
    if (data.type === "welcome") {
      Net.joined = true;
      Net.youId = data.youId;
      if (Net.callbacks && Net.callbacks.onWelcome) Net.callbacks.onWelcome(data.state, data.youId);
    } else if (data.type === "state") {
      if (Net.callbacks && Net.callbacks.onState) Net.callbacks.onState(data.state);
    } else if (data.type === "error") {
      Net.failed = true;
      if (Net.callbacks && Net.callbacks.onError) Net.callbacks.onError(data.message);
    }
  };

  // ---------------- Shared actions ----------------
  Net.mark = function (cellIndex) {
    if (Net.isHost) {
      Net.toggleMark(Net.youId, cellIndex);
    } else if (Net.channel && Net.channel.readyState === "open") {
      send(Net.channel, { type: "mark", cellIndex: cellIndex });
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
    Net.conns.forEach(function (ch) { try { ch.close(); } catch (e) {} });
    Net.conns.clear();
    Net.invites.forEach(function (inv) { try { inv.pc.close(); } catch (e) {} });
    Net.invites.clear();
    if (Net.pc) { try { Net.pc.close(); } catch (e) {} }
    Net.pc = null;
    Net.channel = null;
    Net.state = null;
    Net.isHost = false;
    Net.youId = null;
    Net.joined = false;
    Net.failed = false;
    Net.callbacks = null;
  };

  BUNGO.Net = Net;
})();
