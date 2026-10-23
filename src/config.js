// Paths and constants. Everything user-specific comes from the environment or OS defaults.
import os from "node:os";
import path from "node:path";

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";

// MQDH's Electron userData folder ("odh"): holds mcp-config.json and ovr-platform-util.
const APPDATA = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
const ODH_DIR = process.env.MQDH_USER_DATA
  || (isMac ? path.join(os.homedir(), "Library", "Application Support", "odh") : path.join(APPDATA, "odh"));

const MQDH_DIR = process.env.MQDH_DIR
  || (isMac ? "/Applications/Meta Quest Developer Hub.app"
    : path.join(process.env.ProgramFiles || "C:\\Program Files", "Meta Quest Developer Hub"));

const BIN_DIR = isMac ? path.join(MQDH_DIR, "Contents", "Resources", "bin") : path.join(MQDH_DIR, "resources", "bin");
const exe = (name) => (isWin ? `${name}.exe` : name);

export const config = {
  isWin,
  metavr: process.env.METAVR_PATH || path.join(BIN_DIR, exe("metavr")),
  ovrPlatformUtil: process.env.OVR_PLATFORM_UTIL || path.join(ODH_DIR, exe("ovr-platform-util")),
  mqdhMcpConfig: path.join(ODH_DIR, "mcp-config.json"),
  stateFile: process.env.MQDH_MCP_STATE || path.join(os.homedir(), ".mqdh-mcp.json"),
  graphUrl: "https://graph.oculus.com/graphql?forced_locale=en_US",
  userAgent: `mqdh-mcp/0.2.0 (${os.platform()} ${os.release()})`,
};
