// Pure game logic: board generation and bingo detection.
(function () {
  // Fisher–Yates shuffle (returns a new array).
  BUNGO.shuffle = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  };

  // Builds a size×size board. The center cell is always a FREE space.
  BUNGO.generateBoard = function (tasks, size) {
    const total = size * size;
    const needed = total - 1;
    const chosen = BUNGO.shuffle(tasks).slice(0, needed);
    const center = Math.floor(total / 2);
    const board = [];
    let t = 0;
    for (let i = 0; i < total; i++) {
      if (i === center) {
        board.push({ index: i, task: null, free: true });
      } else {
        board.push({ index: i, task: chosen[t++], free: false });
      }
    }
    return board;
  };

  // Returns { cells: [...] } if `playerId` has a full line, otherwise null.
  // `marks` maps cellIndex -> array of player ids. The FREE center counts for everyone.
  BUNGO.checkBingo = function (board, size, marks, playerId) {
    const center = Math.floor((size * size) / 2);
    const has = function (idx) {
      return idx === center || (marks[idx] && marks[idx].indexOf(playerId) >= 0);
    };

    // Rows
    for (let r = 0; r < size; r++) {
      const cells = [];
      let ok = true;
      for (let c = 0; c < size; c++) {
        const idx = r * size + c;
        cells.push(idx);
        if (!has(idx)) ok = false;
      }
      if (ok) return { cells: cells };
    }

    // Columns
    for (let c = 0; c < size; c++) {
      const cells = [];
      let ok = true;
      for (let r = 0; r < size; r++) {
        const idx = r * size + c;
        cells.push(idx);
        if (!has(idx)) ok = false;
      }
      if (ok) return { cells: cells };
    }

    // Diagonal (top-left → bottom-right)
    let cells = [];
    let ok = true;
    for (let i = 0; i < size; i++) {
      const idx = i * size + i;
      cells.push(idx);
      if (!has(idx)) ok = false;
    }
    if (ok) return { cells: cells };

    // Diagonal (top-right → bottom-left)
    cells = [];
    ok = true;
    for (let i = 0; i < size; i++) {
      const idx = i * size + (size - 1 - i);
      cells.push(idx);
      if (!has(idx)) ok = false;
    }
    if (ok) return { cells: cells };

    return null;
  };
})();
