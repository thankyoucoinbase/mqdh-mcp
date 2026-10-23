// Offline tests: no Meta login or network needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUploadArgs } from "../Source/upload.js";
import { connect } from "./helpers.js";

const base = { appId: "123456789", platform: "ANDROID_6DOF", apk: "game.apk", token: "<token>" };

test("LIVE channel is uploaded as 'store'", () => {
  const args = buildUploadArgs({ ...base, channel: { name: "LIVE", is_live: true } });
  assert.equal(args[args.indexOf("--channel") + 1], "store");
});

test("uploads are drafts unless publish=true", () => {
  const ch = { name: "ALPHA", is_live: false };
  assert.ok(buildUploadArgs({ ...base, channel: ch }).includes("--draft"));
  assert.ok(!buildUploadArgs({ ...base, channel: ch, publish: true }).includes("--draft"));
});

test("PC apps use upload-rift-build with --build-dir", () => {
  const args = buildUploadArgs({ ...base, platform: "PC", channel: { name: "BETA", is_live: false } });
  assert.equal(args[0], "upload-rift-build");
  assert.ok(args.includes("--build-dir"));
});

test("optional flags are passed through", () => {
  const args = buildUploadArgs({ ...base, channel: { name: "RC", is_live: false }, obb: "x.obb", notes: "hi", extraArgs: ["--age-group", "MIXED_AGES"] });
  for (const flag of ["--obb", "--notes", "--age-group"]) assert.ok(args.includes(flag), flag);
});

test("server exposes all tools", async () => {
  const { client, close } = await connect();
  const names = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["auth_status", "copy_build", "graphql", "list_apps", "list_channels", "list_orgs",
    "list_test_users", "metavr", "select_org", "upload_build", "upload_status"]);
  await close();
});

test("upload_build rejects a missing file before doing anything", async () => {
  const { call, close } = await connect();
  const r = await call("upload_build", { app: "123456789", channel: "ALPHA", apk: "/definitely/not/here.apk" });
  assert.ok(r.isError && /File not found/.test(r.text));
  await close();
});
