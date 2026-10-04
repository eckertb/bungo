// Video game data.
// The canonical source of truth is data/games/<id>.json (easy to edit by hand).
// When the app is served over HTTP the JSON files are fetched directly.
// When opened via file:// (where browsers block fetch), the FALLBACK copy below
// is used instead — keep it in sync with the JSON files.

window.BUNGO = window.BUNGO || {};

BUNGO.GAME_IDS = ["mario64"];

BUNGO.GAMES_FALLBACK = {
  mario64: {
    id: "mario64",
    name: "Super Mario 64",
    tasks: [
      "Collect a Star in Bob-omb Battlefield",
      "Defeat King Bob-omb",
      "Collect 8 Red Coins in any level",
      "Collect 100 coins in a single level",
      "Ride a Koopa Shell",
      "Ground pound a wooden post",
      "Break open a wooden box",
      "Talk to a Toad",
      "Find a secret Star in Peach's Castle",
      "Unlock a cannon",
      "Launch yourself from a cannon",
      "Defeat the Whomp King",
      "Collect a Star in Whomp's Fortress",
      "Slide down Cool, Cool Mountain",
      "Race the penguin down the slide",
      "Carry the baby penguin to its mother",
      "Collect a Star in Jolly Roger Bay",
      "Open a treasure chest",
      "Collect a Star in Lethal Lava Land",
      "Ground pound the Chain Chomp's post",
      "Collect a Star in Shifting Sand Land",
      "Enter the pyramid",
      "Collect a Star in Dire, Dire Docks",
      "Collect a Star in Snowman's Land",
      "Freeze an enemy",
      "Collect a Star in Wet-Dry World",
      "Change the water level",
      "Collect a Star in Tall, Tall Mountain",
      "Collect a Star in Tiny-Huge Island",
      "Become tiny or huge",
      "Collect a Star in Tick Tock Clock",
      "Collect a Star in Rainbow Ride",
      "Defeat Bowser",
      "Collect a Star in Hazy Maze Cave",
      "Ride Dorrie the dinosaur",
      "Collect a Star in Big Boo's Haunt",
      "Defeat Big Boo",
      "Collect a Star in the secret aquarium",
      "Collect 50 coins in Peach's Castle",
      "Jump into a painting",
      "Wall kick to reach a high ledge",
      "Perform a triple jump",
      "Long jump across a gap",
      "Backflip onto a higher platform",
      "Find a hidden 1-Up",
      "Reach the castle rooftop",
      "Collect a red coin inside the castle",
      "Ride the magic carpet",
      "Break a brick while invisible",
      "Fly with the Wing Cap",
      "Collect 8 red coins in the sky",
      "Sink underwater with the Metal Cap",
      "Collect a Star in Bowser in the Dark World",
      "Collect a Star in Bowser in the Fire Sea",
      "Collect a Star in Bowser in the Sky",
      "Throw Bowser into a mine",
      "Collect 120 Power Stars"
    ]
  }
};

BUNGO.games = {};

// Loads each registered game. Tries the JSON file first, falls back to the
// embedded copy when fetch is unavailable (e.g. file:// in Chrome/Edge).
BUNGO.loadGames = async function () {
  for (const id of BUNGO.GAME_IDS) {
    let data = null;
    try {
      const res = await fetch("data/games/" + id + ".json");
      if (res.ok) data = await res.json();
    } catch (e) {
      /* fall through to fallback */
    }
    if (!data) data = BUNGO.GAMES_FALLBACK[id];
    BUNGO.games[id] = data;
  }
  return BUNGO.games;
};

BUNGO.getTasks = function (id) {
  return (BUNGO.games[id] && BUNGO.games[id].tasks) || [];
};

BUNGO.getGameName = function (id) {
  return (BUNGO.games[id] && BUNGO.games[id].name) || id;
};
