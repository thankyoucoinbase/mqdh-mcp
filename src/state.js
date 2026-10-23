// Small persisted state (currently just the selected organization).
import fs from "node:fs";
import { config } from "./config.js";

export function loadState() {
  try { return JSON.parse(fs.readFileSync(config.stateFile, "utf8")); } catch { return {}; }
}

export function saveState(state) {
  fs.writeFileSync(config.stateFile, JSON.stringify(state, null, 2));
}
