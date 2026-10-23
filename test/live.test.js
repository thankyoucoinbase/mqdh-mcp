// Live, read-only tests against your Meta developer account. Never uploads or mutates anything.
// Run with: npm run test:live   (requires a logged-in MQDH or metavr)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { connect } from "./helpers.js";

const live = process.env.MQDH_LIVE_TESTS === "1" || process.env.npm_lifecycle_event === "test:live";
let s, org, app, apk;

before(async () => {
  if (!live) return;
  s = await connect();
  apk = path.join(s.tmp, "dummy.apk");
  fs.writeFileSync(apk, "not a real apk");
  // Find any org with an app that has a LIVE channel.
  for (const o of (await s.call("list_orgs")).json) {
    const r = await s.call("list_apps", { org: o.id });
    const hit = r.json?.apps.find((a) => a.channels.includes("LIVE"));
    if (hit) { org = o; app = hit; break; }
  }
});
after(async () => s?.close());

const t = (name, fn) => test(name, { skip: !live && "set MQDH_LIVE_TESTS=1" }, fn);

t("auth_status", async () => assert.ok((await s.call("auth_status")).json.logged_in));
t("found an org with a LIVE app", () => assert.ok(app));
t("list_apps without org fails before selection", async () => assert.ok((await s.call("list_apps")).isError));
t("select_org by partial name", async () => {
  const r = await s.call("select_org", { org: org.name.slice(0, 4) });
  assert.equal(r.json.selected.id, org.id);
});
t("list_orgs marks the selection", async () => assert.equal((await s.call("list_orgs")).json.find((o) => o.selected).id, org.id));
t("list_apps uses the selected org", async () => assert.equal((await s.call("list_apps")).json.org.id, org.id));
t("list_channels by name and id", async () => {
  assert.ok((await s.call("list_channels", { app: app.name })).json.channels.some((c) => c.is_live));
  assert.ok(!(await s.call("list_channels", { app: app.id })).isError);
});
t("list_test_users", async () => assert.ok(Array.isArray((await s.call("list_test_users")).json)));
t("LIVE publish requires confirm_live", async () => {
  const r = await s.call("upload_build", { app: app.id, channel: "LIVE", apk, publish: true });
  assert.ok(r.isError && /confirm_live/.test(r.text));
});
t("dry_run LIVE draft maps to store + --draft", async () => {
  const cmd = (await s.call("upload_build", { app: app.id, channel: "live", apk, dry_run: true })).json.command;
  assert.ok(cmd.join(" ").includes("--channel store") && cmd.includes("--draft") && cmd.includes("<token>"));
});
t("real upload is blocked in tests", async () => {
  const r = await s.call("upload_build", { app: app.id, channel: "ALPHA", apk });
  assert.ok(r.isError && /ovr-platform-util not found/.test(r.text));
  assert.equal((await s.call("upload_status")).json.length, 0);
});
t("copy_build into LIVE requires confirm_live", async () => {
  assert.ok((await s.call("copy_build", { app: app.id, binary_id: "0", to_channel: "LIVE" })).isError);
});
t("unknown channel lists valid channels", async () => {
  assert.match((await s.call("upload_build", { app: app.id, channel: "NOPE", apk, dry_run: true })).text, /Channels:/);
});
t("graphql raw query", async () => assert.ok((await s.call("graphql", { query: "query { viewer { user { id } } }" })).json.viewer.user.id));
