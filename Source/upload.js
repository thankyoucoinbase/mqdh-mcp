// Build uploads via Meta's ovr-platform-util, run as background jobs.
import fs from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { resolveToken } from "./auth.js";

export const jobs = new Map();
const MAX_LINES = 400;

export function buildUploadArgs({ appId, platform, channel, apk, obb, notes, publish, extraArgs, token }) {
  const isPC = platform === "PC";
  const args = [isPC ? "upload-rift-build" : "upload-quest-build",
    "--app_id", appId, "--token", token,
    // The LIVE channel is uploaded under the name "store", matching MQDH.
    "--channel", channel.is_live ? "store" : channel.name];
  if (isPC) args.push("--build-dir", apk); else args.push("--apk", apk);
  if (obb) args.push("--obb", obb);
  if (notes) args.push("--notes", notes);
  args.push("--disable-progress-bar");
  if (!publish) args.push("--draft");
  args.push(...(extraArgs || []));
  return args;
}

export function startUpload({ appId, appName, platform, channel, apk, obb, notes, publish, extraArgs }) {
  if (!fs.existsSync(config.ovrPlatformUtil)) {
    throw new Error(`ovr-platform-util not found at ${config.ovrPlatformUtil}. Open MQDH once to download it, or set OVR_PLATFORM_UTIL.`);
  }
  const job = {
    id: randomUUID().slice(0, 8), app: appName || appId, app_id: appId, channel: channel.name, is_live: channel.is_live,
    mode: publish ? "publish" : "draft", apk, status: "starting", started_at: new Date().toISOString(),
    output: [], errors: [], exit_code: null,
  };
  jobs.set(job.id, job);

  (async () => {
    const { token } = await resolveToken();
    const args = buildUploadArgs({ appId, platform, channel, apk, obb, notes, publish, extraArgs, token });
    job.status = "uploading";
    const child = spawn(config.ovrPlatformUtil, args, { windowsHide: true });
    const collect = (sink) => (buf) => {
      for (const line of buf.toString().split(/\r?\n/)) {
        if (!line.trim()) continue;
        sink.push(line.replaceAll(token, "<token>"));
        if (sink.length > MAX_LINES) sink.shift();
      }
    };
    child.stdout.on("data", collect(job.output));
    child.stderr.on("data", collect(job.errors));
    child.on("close", (code) => {
      job.exit_code = code;
      job.status = code === 0 ? "succeeded" : "failed";
      job.finished_at = new Date().toISOString();
    });
    child.on("error", (e) => { job.status = "failed"; job.errors.push(String(e)); });
  })().catch((e) => { job.status = "failed"; job.errors.push(String(e.message || e)); });

  return job;
}
