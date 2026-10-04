// UI wiring and state rendering.
(function () {
  var $ = function (sel) { return document.querySelector(sel); };

  var myPlayerId = null;

  var homeScreen = $("#home-screen");
  var roomScreen = $("#room-screen");

  function show(screen) {
    homeScreen.classList.add("hidden");
    roomScreen.classList.add("hidden");
    screen.classList.remove("hidden");
  }

  function showToast(msg, isError) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.toggle("error", !!isError);
    t.classList.remove("hidden");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { t.classList.add("hidden"); }, 4000);
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
    setBusy(true);
    $("#btn-create").textContent = "Creating…";
    BUNGO.Net.host(gameId, size, name, makeCallbacks(true));
  });

  $("#btn-join").addEventListener("click", function () {
    var code = $("#join-code").value.trim().toUpperCase();
    var name = $("#join-name").value.trim() || "Player";
    if (!/^[A-Z0-9]{4}$/.test(code)) {
      showToast("Room codes are 4 letters or numbers.", true);
      return;
    }
    setBusy(true);
    $("#btn-join").textContent = "Joining…";
    BUNGO.Net.join(code, name, makeCallbacks(false));
  });

  $("#btn-copy-code").addEventListener("click", function () {
    var code = $("#room-code").textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code)
        .then(function () { showToast("Code copied: " + code); })
        .catch(function () { showToast("Code: " + code); });
    } else {
      showToast("Code: " + code);
    }
  });

  $("#btn-new-round").addEventListener("click", function () {
    BUNGO.Net.newRound();
  });

  $("#btn-leave").addEventListener("click", function () {
    BUNGO.Net.leave();
    myPlayerId = null;
    resetButtons();
    show(homeScreen);
  });

  // ---------- Callbacks from the network layer ----------
  function makeCallbacks(isHost) {
    return {
      onReady: function (info) {
        resetButtons();
        myPlayerId = info.youId;
        $("#btn-new-round").classList.toggle("hidden", !isHost);
        show(roomScreen);
        render(info.state);
      },
      onWelcome: function (state, youId) {
        resetButtons();
        myPlayerId = youId;
        $("#btn-new-round").classList.add("hidden");
        show(roomScreen);
        render(state);
      },
      onState: function (state) {
        render(state);
      },
      onError: function (msg) {
        resetButtons();
        showToast(msg, true);
      },
      onRoomClosed: function () {
        resetButtons();
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
    $("#room-code").textContent = state.code;
    renderPlayers(state.players);
    renderStatus(state.winner);
    renderBoard(state);
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
    if (typeof Peer === "undefined") {
      showToast("Could not load the networking library (needs internet).", true);
    }
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
