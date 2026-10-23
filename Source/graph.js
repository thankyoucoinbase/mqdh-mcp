// graph.oculus.com client plus the org / app / channel lookups built on it.
import { config } from "./config.js";
import { resolveToken } from "./auth.js";
import { loadState } from "./state.js";

// Persisted operations used by MQDH 6.5.2 (graph.oculus.com rejects most named inline queries).
export const OPS = {
  orgs: { doc_id: "9800079293385134", name: "OrgsQuery" },                                  // {}
  apps: { doc_id: "27049994607975661", name: "getAppsQuery" },                              // {appCount, orgID}
  appView: { doc_id: "24752313997783774", name: "AppViewQuery" },                           // {applicationID}
  copyBuild: { doc_id: "9699786920080646", name: "AppReleaseChannelRowCopyBuildMutation" }, // {input:{binary_id, release_channel_id}}
  testUsers: { doc_id: "9625867810789714", name: "TestAccountsManagerQuery" },              // {orgId}
};

// `op` is raw query text or a persisted operation { doc_id, name }.
export async function graphql(op, variables = {}, { retryAuth = true } = {}) {
  const { token } = await resolveToken();
  const body = new URLSearchParams({ access_token: token, variables: JSON.stringify(variables) });
  if (typeof op === "string") body.set("doc", op);
  else { body.set("doc_id", op.doc_id); body.set("operation_name", op.name); }

  const res = await fetch(config.graphUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": config.userAgent },
    body,
  });
  const text = await res.text();
  // Responses may be newline-delimited JSON chunks; the first holds data/errors.
  let json;
  try { json = JSON.parse(text.split("\n")[0]); } catch { throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`); }
  const err = json.error || json.errors?.[0];
  if (err) {
    if (retryAuth && (err.code === 190 || res.status === 401)) {
      await resolveToken({ refresh: true });
      return graphql(op, variables, { retryAuth: false });
    }
    throw new Error(`GraphQL error: ${err.message || JSON.stringify(err)}`);
  }
  return json.data;
}

export async function listOrgs() {
  const d = await graphql(OPS.orgs);
  return (d.viewer?.user?.organizations?.nodes || []).sort((a, b) => a.name.localeCompare(b.name));
}

// org: id or (partial) name; falls back to the selected org.
export async function resolveOrg(org) {
  if (!org) {
    const selected = loadState().org;
    if (selected) return selected;
    throw new Error("No organization given and none selected. Call list_orgs, then select_org.");
  }
  const orgs = await listOrgs();
  const q = org.toLowerCase();
  const hit = orgs.find((o) => o.id === org) || orgs.find((o) => o.name.toLowerCase() === q)
    || orgs.find((o) => o.name.toLowerCase().includes(q));
  if (!hit) throw new Error(`No organization matches "${org}". Available: ${orgs.map((o) => `${o.name} (${o.id})`).join(", ")}`);
  return hit;
}

export async function listApps(orgId) {
  const d = await graphql(OPS.apps, { appCount: 1000, orgID: orgId });
  return (d.org?.applications?.nodes || []).map((a) => ({
    id: a.id, name: a.display_name, platform: a.platform, approved: a.is_approved, concept: a.is_concept,
    channels: (a.release_channels?.nodes || []).map((c) => c.channel_name),
  }));
}

// app: numeric id, or (partial) name within the given/selected org.
export async function resolveApp(app, org) {
  if (/^\d{6,}$/.test(app)) return { id: app };
  const o = await resolveOrg(org);
  const apps = await listApps(o.id);
  const q = app.toLowerCase();
  const exact = apps.filter((a) => a.name.toLowerCase() === q);
  const hits = exact.length ? exact : apps.filter((a) => a.name.toLowerCase().includes(q));
  if (hits.length === 1) return hits[0];
  if (!hits.length) throw new Error(`No app in "${o.name}" matches "${app}".`);
  throw new Error(`"${app}" is ambiguous in "${o.name}": ${hits.map((a) => `${a.name} (${a.id})`).join(", ")}`);
}

export async function getChannels(appId) {
  const d = await graphql(OPS.appView, { applicationID: appId });
  if (!d.app) throw new Error(`App ${appId} not found or not visible to this account.`);
  const liveId = d.app.live_release_channel?.id;
  return {
    app: { id: d.app.id, name: d.app.display_name, platform: d.app.platform },
    channels: (d.app.release_channels?.nodes || []).map((c) => ({
      id: c.id,
      name: c.channel_name,
      is_live: c.id === liveId,
      users: c.total_users_count,
      latest_builds: (c.latest_supported_binaries || []).map(({ id, version, version_code, created_date, file_name, size }) =>
        ({ id, version, version_code, created_date, file_name, size })),
    })),
  };
}

// channel: "LIVE"/"store"/"production", a channel name, or a channel id.
export async function resolveChannel(appId, channel) {
  const { channels } = await getChannels(appId);
  const q = channel.toLowerCase();
  const hit = channels.find((c) => c.id === channel)
    || (["live", "store", "production"].includes(q) && channels.find((c) => c.is_live))
    || channels.find((c) => c.name.toLowerCase() === q);
  if (!hit) throw new Error(`No channel "${channel}". Channels: ${channels.map((c) => `${c.name}${c.is_live ? " [LIVE]" : ""}`).join(", ")}`);
  return hit;
}
