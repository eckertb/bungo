// UI wiring and state rendering.
(function () {
  var $ = function (sel) { return document.querySelector(sel); };

  var myPlayerId = null;
  var inviteCards = {};

  var homeScreen = $("#home-screen");
  var answerScreen = $("#answer-screen");
  var roomScreen = $("#room-screen");

  function show(screen) {
    homeScreen.classList.add("hidden");
    answerScreen.classList.add("hidden");
    roomScreen.classList.add("hidden");
    screen.classList.remove("hidden");
  }

  function showToast(msg, isError) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.toggle("error", !!isError);
    t.classList.remove("hidden");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { t.classList.add("hidden"); }, 5000);
  }

  function setBusy(b) {
    $("#btn-create").disabled = b;
    $("#btn-join").disabled = b;
  }

  function resetButtons() {
    setBusy(false);
    $("#btn-create").textContent = "Create room";
    $("#btn-join").textContent = "Join room";
  }

  function copyText(text, okMsg) {
    function fallback() { showToast(okMsg || "Copied."); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { showToast(okMsg || "Copied."); })
        .catch(fallback);
    } else {
      fallback();
    }
  }

  // ---------- Home screen ----------
  $("#btn-show-create").addEventListener("click", function () {
    $("#create-panel").classList.toggle("hidden");
    $("#join-panel").classList.add("hidden");
  });

  $("#btn-show-join").addEventListener("click", function () {
    $("#join-panel").classList.toggle("hidden");
    $("#create-panel").classList.add("hidden");
  });

  $("#btn-create").addEventListener("click", function () {
    var gameId = $("#game-select").value;
    var size = parseInt($("#size-select").value, 10);
    var name = $("#host-name").value.trim() || "Host";
    var needed = size * size - 1;
    if (BUNGO.getTasks(gameId).length < needed) {
      showToast("This game doesn't have enough tasks for a " + size + "×" + size + " board.", true);
      return;
    }
    BUNGO.Net.host(gameId, size, name, makeCallbacks(true));
  });

  $("#btn-join").addEventListener("click", function () {
    var invite = $("#join-invite").value.trim();
    var name = $("#join-name").value.trim() || "Player";
    if (!invite) {
      showToast("Paste the invite the host sent you.", true);
      return;
    }
    show(answerScreen);
    $("#answer-box").value = "";
    $("#btn-copy-answer").disabled = true;
    $("#answer-status").textContent = "Preparing your answer…";
    $("#answer-status").className = "invite-status";
    BUNGO.Net.join(invite, name, makeCallbacks(false));
  });

  $("#btn-copy-answer").addEventListener("click", function () {
    var v = $("#answer-box").value;
    if (v) copyText(v, "Answer copied. Send it back to the host.");
  });

  $("#btn-answer-back").addEventListener("click", function () {
    BUNGO.Net.leave();
    myPlayerId = null;
    show(homeScreen);
  });

  // ---------- Room screen ----------
  $("#btn-new-round").addEventListener("click", function () { BUNGO.Net.newRound(); });

  $("#btn-leave").addEventListener("click", function () {
    BUNGO.Net.leave();
    myPlayerId = null;
    resetButtons();
    show(homeScreen);
  });

  $("#btn-add-player").addEventListener("click", addPlayer);

  function addPlayer() {
    var list = $("#invites-list");
    var card = document.createElement("div");
    card.className = "invite-card";
    card.innerHTML =
      '<button class="btn btn-ghost remove-invite">✕</button>' +
      '<span class="label">Invite (send to a player)</span>' +
      '<textarea class="blob invite-box" rows="3" readonly></textarea>' +
      '<div class="invite-actions"><button class="btn btn-ghost copy-invite">Copy invite</button></div>' +
      '<span class="label">Answer (paste from that player)</span>' +
      '<textarea class="blob answer-box" rows="3" placeholder="Paste their answer…"></textarea>' +
      '<div class="invite-actions"><button class="btn btn-primary connect-btn">Connect</button></div>' +
      '<div class="invite-status">Generating invite…</div>';
    list.appendChild(card);

    var inviteBox = card.querySelector(".invite-box");
    var answerBox = card.querySelector(".answer-box");
    var statusEl = card.querySelector(".invite-status");
    var copyBtn = card.querySelector(".copy-invite");
    var connectBtn = card.querySelector(".connect-btn");
    var removeBtn = card.querySelector(".remove-invite");

    var inviteId = null;
    var connected = false;

    function setStatus(text, cls) {
      statusEl.textContent = text;
      statusEl.className = "invite-status" + (cls ? " " + cls : "");
    }

    copyBtn.addEventListener("click", function () {
      if (inviteBox.value) copyText(inviteBox.value, "Invite copied. Send it to a player.");
    });

    connectBtn.addEventListener("click", function () {
      if (!inviteId || connected) return;
      var answer = answerBox.value.trim();
      if (!answer) { setStatus("Paste the player's answer first.", "err"); return; }
      connectBtn.disabled = true;
      setStatus("Connecting…");
      BUNGO.Net.acceptAnswer(inviteId, answer).then(function () {
        setStatus("Accepted — waiting for the data channel…");
      }).catch(function (e) {
        connectBtn.disabled = false;
        setStatus(e && e.message ? e.message : "Could not connect.", "err");
      });
    });

    removeBtn.addEventListener("click", function () {
      if (inviteId) { delete inviteCards[inviteId]; BUNGO.Net.discardInvite(inviteId); }
      card.remove();
      updateAddPlayerState();
    });

    card._markConnected = function () {
      connected = true;
      setStatus("Connected ✓", "ok");
      connectBtn.disabled = true;
      answerBox.disabled = true;
      copyBtn.disabled = true;
    };

    BUNGO.Net.createInvite().then(function (res) {
      inviteId = res.id;
      inviteCards[res.id] = card;
      inviteBox.value = res.invite;
      setStatus("Send this invite to a player, then paste their answer above.");
    }).catch(function (e) {
      setStatus(e && e.message ? e.message : "Could not create invite.", "err");
    });
  }

  function updateAddPlayerState() {
    var count = BUNGO.Net.state ? BUNGO.Net.state.players.length : 0;
    $("#btn-add-player").disabled = count >= BUNGO.MAX_PLAYERS;
  }

  // ---------- Callbacks from the network layer ----------
  function makeCallbacks(isHost) {
    return {
      onReady: function (info) {
        myPlayerId = info.youId;
        $("#btn-new-round").classList.toggle("hidden", !isHost);
        $("#invites-section").classList.toggle("hidden", !isHost);
        $("#room-subtitle").textContent = "You are the host. Invite up to 8 players below.";
        show(roomScreen);
        render(info.state);
      },
      onAnswerReady: function (answerStr) {
        $("#answer-box").value = answerStr;
        $("#btn-copy-answer").disabled = false;
        $("#answer-status").textContent = "Copy this answer and send it back to the host. Waiting for them to accept…";
      },
      onWelcome: function (state, youId) {
        myPlayerId = youId;
        $("#btn-new-round").classList.add("hidden");
        $("#invites-section").classList.add("hidden");
        $("#room-subtitle").textContent = "Connected to the host.";
        show(roomScreen);
        render(state);
      },
      onState: function (state) {
        render(state);
      },
      onInviteConnected: function (id) {
        var card = inviteCards[id];
        if (card && card._markConnected) card._markConnected();
        updateAddPlayerState();
      },
      onError: function (msg) {
        showToast(msg, true);
        if (!answerScreen.classList.contains("hidden")) {
          $("#answer-status").textContent = msg;
          $("#answer-status").className = "invite-status err";
        }
      },
      onRoomClosed: function () {
        showToast("The host closed the room.", true);
        BUNGO.Net.leave();
        myPlayerId = null;
        show(homeScreen);
      }
    };
  }

  // ---------- Rendering ----------
  function render(state) {
    $("#room-game-name").textContent = state.gameName;
    renderPlayers(state.players);
    renderStatus(state.winner);
    renderBoard(state);
    updateAddPlayerState();
  }

  function renderPlayers(players) {
    var el = $("#players-bar");
    el.innerHTML = "";
    players.forEach(function (p) {
      var chip = document.createElement("span");
      chip.className = "player-chip";

      var dot = document.createElement("i");
      dot.className = "dot";
      dot.style.background = p.color.hex;
      chip.appendChild(dot);

      var label = document.createElement("span");
      label.textContent = p.name +
        (p.isHost ? " · host" : "") +
        (p.id === myPlayerId ? " · you" : "");
      chip.appendChild(label);

      el.appendChild(chip);
    });
  }

  function renderStatus(winner) {
    var el = $("#status-bar");
    el.innerHTML = "";
    if (winner) {
      var b = document.createElement("div");
      b.className = "winner-banner";
      b.textContent = "🏆 " + winner.name + " got a BINGO!";
      if (winner.color) {
        b.style.color = winner.color.hex;
        b.style.borderColor = winner.color.hex;
      }
      el.appendChild(b);
    } else {
      el.textContent = "First to a complete line wins!";
    }
  }

  function renderBoard(state) {
    var boardEl = $("#board");
    boardEl.innerHTML = "";
    boardEl.className = "board size-" + state.size;
    boardEl.style.setProperty("--size", state.size);
    boardEl.style.setProperty("--win-color",
      (state.winner && state.winner.color) ? state.winner.color.hex : "#ffffff");

    state.board.forEach(function (cell) {
      var div = document.createElement("button");
      div.type = "button";
      div.className = "cell";

      var marks = state.marks[cell.index] || [];
      if (marks.indexOf(myPlayerId) >= 0) div.classList.add("mine");
      if (state.winner && state.winner.cells && state.winner.cells.indexOf(cell.index) >= 0) {
        div.classList.add("winning");
      }
      if (state.winner) div.classList.add("locked");

      if (cell.free) {
        div.classList.add("free");
        div.title = "FREE space";
        var label = document.createElement("span");
        label.className = "free-label";
        label.innerHTML = "★<br>FREE";
        div.appendChild(label);
      } else {
        var task = document.createElement("span");
        task.className = "task";
        task.textContent = cell.task;
        div.appendChild(task);
        applyMarkColor(div, marks, state.players, cell.task);
      }

      div.addEventListener("click", function () {
        if (cell.free || state.winner) return;
        BUNGO.Net.mark(cell.index);
      });

      boardEl.appendChild(div);
    });
  }

  // Colors a cell's background with the color(s) of the players who marked it.
  // A single player fills the cell; several players split it into equal segments.
  function applyMarkColor(div, marks, players, taskText) {
    if (!marks.length) return;
    var colors = [];
    var names = [];
    marks.forEach(function (pid) {
      var p = players.find(function (x) { return x.id === pid; });
      if (p) {
        colors.push(p.color.hex);
        names.push(p.name);
      }
    });
    if (!colors.length) return;

    div.title = taskText + " — " + names.join(", ");

    // Semi-transparent black overlay keeps the white text readable on any color.
    var dark = "linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4))";
    if (colors.length === 1) {
      div.style.background = dark + ", " + colors[0];
    } else {
      var step = 100 / colors.length;
      var stops = colors.map(function (c, i) {
        return c + " " + (i * step).toFixed(2) + "% " + ((i + 1) * step).toFixed(2) + "%";
      });
      div.style.background = dark + ", conic-gradient(" + stops.join(", ") + ")";
    }
  }

  // ---------- Boot ----------
  async function init() {
    try {
      await BUNGO.loadGames();
      var sel = $("#game-select");
      BUNGO.GAME_IDS.forEach(function (id) {
        var opt = document.createElement("option");
        opt.value = id;
        opt.textContent = BUNGO.getGameName(id);
        sel.appendChild(opt);
      });
    } catch (e) {
      showToast("Could not load game data.", true);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
