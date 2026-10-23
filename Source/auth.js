// Resolves the developer's graph.oculus.com access token, reusing an existing MQDH/metavr login.
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";

const execFileP = promisify(execFile);

// Reads the Windows Credential Manager entry MQDH writes via keytar ("<service>/<account>").
const CRED_READ_PS = `
$sig = @'
[DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
public static extern bool CredRead(string target, int type, int flags, out IntPtr cred);
[DllImport("advapi32.dll")] public static extern void CredFree(IntPtr cred);
[StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
public struct CREDENTIAL { public int Flags; public int Type; public string TargetName; public string Comment;
  public long LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;
  public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
'@
Add-Type -MemberDefinition $sig -Namespace W -Name C
$p = [IntPtr]::Zero
if ([W.C]::CredRead('Meta Quest Developer Hub/default', 1, 0, [ref]$p)) {
  $c = [Runtime.InteropServices.Marshal]::PtrToStructure($p, [type][W.C+CREDENTIAL])
  $b = New-Object byte[] $c.CredentialBlobSize
  [Runtime.InteropServices.Marshal]::Copy($c.CredentialBlob, $b, 0, $c.CredentialBlobSize)
  [W.C]::CredFree($p)
  [Text.Encoding]::UTF8.GetString($b)
}`;

const SOURCES = [
  ["env MQDH_TOKEN", async () => process.env.MQDH_TOKEN],
  ["MQDH mcp-config.json", async () => JSON.parse(fs.readFileSync(config.mqdhMcpConfig, "utf8")).meta_wand_token],
  ["Windows Credential Manager (MQDH)", async () => {
    if (!config.isWin) return null;
    const { stdout } = await execFileP("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", CRED_READ_PS], { windowsHide: true });
    return stdout.trim();
  }],
  ["metavr auth profile-token", async () => {
    const { stdout } = await execFileP(config.metavr, ["auth", "profile-token", "--format", "json"], { windowsHide: true });
    return JSON.parse(stdout).token;
  }],
];

let cached = null;

export async function resolveToken({ refresh = false } = {}) {
  if (cached && !refresh) return cached;
  for (const [source, read] of SOURCES) {
    try {
      const token = await read();
      // "OC|<appId>|" is MQDH's anonymous placeholder, not a user login.
      if (token && !/^OC\|\d+\|$/.test(token)) return (cached = { token, source });
    } catch { /* try next source */ }
  }
  throw new Error("No Meta login found. Log in to Meta Quest Developer Hub (or run `metavr auth login`), or set MQDH_TOKEN.");
}
