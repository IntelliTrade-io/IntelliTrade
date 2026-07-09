# VPS deploy runbook (plan 6.7)

Git-based deploy for the Windows VPS. Replaces hand-copying files over RDP.
The VPS runs only the **scanners + watchdog** (and the S&R backend); the
Next.js app and the economic-calendar scraper run elsewhere (Vercel / GitHub
Actions), so the box takes a **sparse checkout**.

`bootstrap.ps1` is idempotent — after the one-time setup below, every future
deploy is just re-running it (or `git pull` + re-run).

---

## One-time setup (owner)

1. **Install git** on the VPS. Add to PATH.

2. **Create a read-only deploy key or fine-grained PAT** for the repo (NOT your
   owner login). Repo → Settings → Deploy keys (read-only), or a fine-grained
   PAT scoped to this repo, contents:read.

3. **Reconcile drift FIRST (do not skip).** The VPS files were hand-edited in
   place historically. Before the box starts pulling, copy the current scanner
   `.py` files off the VPS (RDP) and hand them to Claude to diff against commit
   `2a010de` (the exact tree last hand-copied there). Fold any real in-place VPS
   edits into the repo. Only then continue — otherwise `git pull` silently
   overwrites possibly-newer production code.

4. **Clone sparse** to the fixed root:

   ```powershell
   cd C:\IntelliTrade
   git clone --no-checkout --depth 1 <repo-url> repo
   cd repo
   git sparse-checkout init --cone
   git sparse-checkout set intellitrade_scanners backend/support_resistance economic_calendar scripts/vps
   git checkout main
   ```

   Cone mode also brings all root files (`pyproject.toml`, `requirements-lock.txt`).
   `economic_calendar/` is included only so `pip install -e .` can resolve every
   package it declares — the VPS doesn't run it. Everything heavy (app/,
   node_modules, public/, sanity/) stays off the box.

5. **Create the runtime `.env`:** copy `scripts/vps/config_template.env` to
   `C:\IntelliTrade\config\.env` and fill in real values (Supabase, MT5, feed).
   Never commit the real `.env`.

6. **Run the bootstrap as Administrator:**

   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\IntelliTrade\repo\scripts\vps\bootstrap.ps1
   ```

   It sets `INTELLITRADE_HOME`, `pip install -e .[mt5]`, and (re)registers the
   three scheduled tasks to run `python -m intellitrade_scanners.*`.

   **Interpreter note:** the script auto-skips the Microsoft Store
   `...\WindowsApps\python.exe` alias (it fails in Session 0, so tasks set to
   "run whether logged in or not" would die silently). If your box only exposes
   that alias on PATH, pass the real one explicitly:
   `...\bootstrap.ps1 -PythonExe "C:\Users\<user>\AppData\Local\Python\pythoncore-3.14-64\python.exe"`.
   Confirm the `Using Python :` line in the output is NOT under `WindowsApps`.

7. **Manual, unavoidable step:** in Task Scheduler, set each IntelliTrade task
   to **"Run whether user is logged in or not"** (enter the account password).
   This is the CSM-outage fix — tasks were running only while logged on.
   Confirm the MT5 terminal is logged into the demo account, then run one scan
   manually to verify:

   ```powershell
   python -m intellitrade_scanners.scanner_h1m15
   ```

---

## Routine deploy (after setup)

```powershell
powershell -ExecutionPolicy Bypass -File C:\IntelliTrade\repo\scripts\vps\bootstrap.ps1
```

- `-SkipPull` — re-register tasks without pulling.
- `-SkipInstall` — skip `pip install` (code-only change, deps unchanged).
- `-Ref <branch>` — deploy a branch other than `main` (e.g. to test the refactor
  branch before merge).
- `-IntelliTradeHome <path>` — non-default install root.
- `-TaskUser <user> -TaskPassword <pw>` — register tasks with **"run whether user
  is logged in or not"** persisted (stored password). **Strongly recommended** —
  without it, bootstrap registers tasks run-only-when-logged-on and you must set
  that flag manually in Task Scheduler *and re-set it after every bootstrap run*
  (it silently reverts, which re-breaks CSM on the next deploy). Example:
  `...\bootstrap.ps1 -TaskUser "$env:COMPUTERNAME\trader" -TaskPassword '<pw>'`.

Because the install is editable (`-e`), a routine code change is just
`git pull` + task run — no reinstall unless dependencies changed.

---

## Notes / scope

- **S&R backend task** (`IntelliTrade SR Alpha`, `python -m support_resistance.run_sr_alpha
  --source mt5`, every 15 min) is now registered by `bootstrap.ps1`. (It was
  repointed on the box first via `schtasks /change`; bootstrap now manages it so
  future deploys keep it on the repo code.)
- `setup_windows_tasks.ps1` (the old flat-file version) is intentionally left in
  place as the pre-git baseline until drift reconciliation is signed off; retire
  it afterwards.
- `backend/support_resistance/fixtures/*.csv.gz` (~2.6 MB) come along with the
  sparse checkout — runtime doesn't need them, but cone mode pulls the whole dir.
  Not worth excluding.
