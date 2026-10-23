#!/usr/bin/env node
// Unofficial MCP server for Meta Quest developers: orgs, apps, release channels, build uploads.
// Not affiliated with or endorsed by Meta.
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config } from "./config.js";
import { resolveToken } from "./auth.js";
import { loadState, saveState } from "./state.js";
import { OPS, graphql, listOrgs, resolveOrg, listApps, resolveApp, getChannels, resolveChannel } from "./graph.js";
import { jobs, buildUploadArgs, startUpload } from "./upload.js";

const execFileP = promisify(execFile);
const server = new McpServer({ name: "mqdh", version: "0.2.0" });

const text = (v) => ({ content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });
function tool(name, description, schema, handler) {
  server.tool(name, description, schema, async (args) => {
    try { return text(await handler(args)); } catch (e) { return { isError: true, content: [{ type: "text", text: String(e.message || e) }] }; }
  });
}

const orgArg = z.string().optional().describe("Organization id or name; defaults to the selected org");
const appArg = z.string().describe("App id, or app name (partial ok) within the selected/given org");

// ---------------------------------------------------------------- account

tool("auth_status", "Check which Meta account is in use and where the token came from.", {}, async () => {
  const { source } = await resolveToken({ refresh: true });
  const d = await graphql(`query { viewer { user { id } } }`);
  return { logged_in: true, token_source: source, user_id: d.viewer?.user?.id, selected_org: loadState().org || null };
});

tool("list_orgs", "List the developer organizations the logged-in account belongs to.", {}, async () => {
  const selected = loadState().org?.id;
  return (await listOrgs()).map((o) => ({ ...o, selected: o.id === selected }));
});

tool("select_org", "Select the active developer organization (by id or name). Saved across sessions.",
  { org: z.string().describe("Organization id or name (partial match ok)") }, async ({ org }) => {
    const o = await resolveOrg(org);
    saveState({ ...loadState(), org: o });
    return { selected: o };
  });

tool("list_test_users", "List test users for an organization.", { org: orgArg }, async ({ org }) => {
  const o = await resolveOrg(org);
  const d = await graphql(OPS.testUsers, { orgId: o.id });
  return d.viewer?.user?.test_users || [];
});

// ---------------------------------------------------------------- apps & channels

tool("list_apps", "List apps in an organization.", { org: orgArg }, async ({ org }) => {
  const o = await resolveOrg(org);
  return { org: o, apps: await listApps(o.id) };
});

tool("list_channels", "List an app's release channels (ALPHA/BETA/RC/LIVE/custom) and their latest builds. The store channel has is_live=true.",
  { app: appArg, org: orgArg }, async ({ app, org }) => getChannels((await resolveApp(app, org)).id));

// ---------------------------------------------------------------- builds

tool("upload_build",
  "Upload an APK (Quest) or build directory (PC) to an app's release channel with ovr-platform-util. " +
  "Uploads as a DRAFT unless publish=true. Publishing to LIVE requires confirm_live=true. " +
  "Use dry_run=true to preview the exact command. Runs in the background: poll upload_status with the returned job_id.",
  {
    app: appArg,
    channel: z.string().describe("ALPHA, BETA, RC, LIVE (store), a custom channel name, or a channel id"),
    apk: z.string().describe("Absolute path to the .apk (Quest) or build directory (PC)"),
    obb: z.string().optional().describe("Optional .obb expansion file path"),
    notes: z.string().optional().describe("Release notes"),
    publish: z.boolean().default(false).describe("Publish immediately instead of uploading as a draft"),
    confirm_live: z.boolean().default(false).describe("Required (true) to publish directly to LIVE"),
    dry_run: z.boolean().default(false).describe("Resolve everything and return the command without uploading"),
    extra_args: z.array(z.string()).optional().describe('Extra ovr-platform-util flags, e.g. ["--age-group","TEENS_AND_ADULTS"]'),
    org: orgArg,
  },
  async ({ app, channel, apk, obb, notes, publish, confirm_live, dry_run, extra_args, org }) => {
    if (!fs.existsSync(apk)) throw new Error(`File not found: ${apk}`);
    if (obb && !fs.existsSync(obb)) throw new Error(`File not found: ${obb}`);
    const appId = (await resolveApp(app, org)).id;
    const { app: info } = await getChannels(appId);
    const ch = await resolveChannel(appId, channel);
    if (ch.is_live && publish && !confirm_live) {
      throw new Error(`Refusing to publish directly to LIVE for "${info.name}" without confirm_live=true. Upload as a draft (publish=false) or confirm.`);
    }
    const summary = { app: info.name, app_id: appId, channel: ch.name, is_live: ch.is_live, mode: publish ? "publish" : "draft" };
    if (dry_run) {
      const args = buildUploadArgs({ appId, platform: info.platform, channel: ch, apk, obb, notes, publish, extraArgs: extra_args, token: "<token>" });
      return { dry_run: true, ...summary, util_found: fs.existsSync(config.ovrPlatformUtil), command: [config.ovrPlatformUtil, ...args] };
    }
    const job = startUpload({ appId, appName: info.name, platform: info.platform, channel: ch, apk, obb, notes, publish, extraArgs: extra_args });
    return { job_id: job.id, ...summary, status: job.status };
  });

tool("upload_status", "Get progress and output of uploads started by upload_build. Omit job_id to list all jobs.",
  { job_id: z.string().optional(), tail: z.number().int().default(40).describe("Output lines to return") },
  async ({ job_id, tail }) => {
    if (!job_id) return [...jobs.values()].map(({ output, errors, ...job }) => job);
    const job = jobs.get(job_id);
    if (!job) throw new Error(`No job ${job_id}`);
    return { ...job, output: job.output.slice(-tail), errors: job.errors.slice(-tail) };
  });

tool("copy_build", "Copy an existing build (binary id from list_channels) into another release channel. Copying into LIVE requires confirm_live=true.",
  {
    app: appArg,
    binary_id: z.string().describe("Build id from list_channels latest_builds"),
    to_channel: z.string().describe("Target channel name or id"),
    confirm_live: z.boolean().default(false),
    org: orgArg,
  },
  async ({ app, binary_id, to_channel, confirm_live, org }) => {
    const appId = (await resolveApp(app, org)).id;
    const ch = await resolveChannel(appId, to_channel);
    if (ch.is_live && !confirm_live) throw new Error("Copying a build into LIVE requires confirm_live=true.");
    const d = await graphql(OPS.copyBuild, { input: { binary_id, release_channel_id: ch.id, client_mutation_id: "" } });
    return { channel: ch.name, result: d.add_binary_to_release_channel };
  });

// ---------------------------------------------------------------- escape hatches

tool("graphql", "Run a raw GraphQL query against graph.oculus.com as the logged-in developer (advanced).",
  { query: z.string(), variables: z.record(z.any()).optional() },
  async ({ query, variables }) => graphql(query, variables || {}));

tool("metavr", "Run any metavr CLI command bundled with MQDH (devices, app install, logcat, perf, ...).",
  { args: z.array(z.string()).describe('e.g. ["device","list","--json"]') }, async ({ args }) => {
    try {
      const { stdout, stderr } = await execFileP(config.metavr, args,
        { windowsHide: true, maxBuffer: 32 << 20, timeout: 600_000, env: { ...process.env, NO_COLOR: "1" } });
      return { stdout, stderr };
    } catch (e) { return { exit_code: e.code, stdout: e.stdout, stderr: e.stderr }; }
  });

await server.connect(new StdioServerTransport());
