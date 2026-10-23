// Spawns the server over stdio in an isolated temp home with uploads disabled.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER = fileURLToPath(new URL("../Source/server.js", import.meta.url));

export async function connect() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mqdh-mcp-test-"));
  const client = new Client({ name: "mqdh-mcp-test", version: "1" });
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: {
      ...process.env,
      MQDH_MCP_STATE: path.join(tmp, "state.json"),
      // Points at a file that does not exist, so tests can never upload anything.
      OVR_PLATFORM_UTIL: path.join(tmp, "ovr-platform-util-disabled"),
    },
  }));
  const call = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const text = r.content[0].text;
    let json; try { json = JSON.parse(text); } catch { /* plain text */ }
    return { isError: !!r.isError, text, json };
  };
  const close = async () => { await client.close(); fs.rmSync(tmp, { recursive: true, force: true }); };
  return { client, call, close, tmp };
}
