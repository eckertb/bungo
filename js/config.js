// Global configuration for Bungo Bingo.
window.BUNGO = window.BUNGO || {};

// PeerJS room IDs are prefixed so they never collide with other PeerJS apps.
BUNGO.ROOM_PREFIX = "bungo-";

// 1 host + up to 8 players who join.
BUNGO.MAX_PLAYERS = 9;

// Unambiguous alphanumerics (no I, O, 0, 1) so codes are easy to read aloud.
BUNGO.CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Unique color tokens, one per player. The host always gets index 0.
BUNGO.COLORS = [
  { name: "Red",     hex: "#e63946" },
  { name: "Orange",  hex: "#f4a261" },
  { name: "Gold",    hex: "#e9c46a" },
  { name: "Green",   hex: "#2a9d8f" },
  { name: "Blue",    hex: "#4361ee" },
  { name: "Purple",  hex: "#9b5de5" },
  { name: "Pink",    hex: "#f15bb5" },
  { name: "Cyan",    hex: "#00b4d8" },
  { name: "Magenta", hex: "#ff006e" },
];
