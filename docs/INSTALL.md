# Install

MachineMaker installs by building itself from source on your machine. The same one-line command installs it the first time **and updates it** every time after. It always builds the latest `prod` branch.

## Prerequisites

| Tool | Version | Get it |
|---|---|---|
| Git | any recent | [git-scm.com](https://git-scm.com/downloads) |
| Node.js | 20 or newer (npm comes with it) | [nodejs.org](https://nodejs.org) |

## Install or update

**Windows** (PowerShell):

```powershell
irm https://raw.githubusercontent.com/joshuakirby/MachineMaker/prod/scripts/install.ps1 | iex
```

**macOS:**

```bash
curl -fsSL https://raw.githubusercontent.com/joshuakirby/MachineMaker/prod/scripts/install.sh | bash
```

**Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/joshuakirby/MachineMaker/prod/scripts/install.sh | bash
```

The first run takes a few minutes: it downloads dependencies and the Electron runtime. Updates are faster, because dependencies are cached in the build folder.

> **On Linux** the script asks for your password once, to give Chromium's sandbox helper the permissions it needs. The app stays sandboxed rather than running with `--no-sandbox`.

## Where things go

| | Windows | macOS | Linux |
|---|---|---|---|
| App | `%LOCALAPPDATA%\Programs\MachineMaker` | `~/Applications/MachineMaker.app` | `~/.local/share/machinemaker/app` |
| Launch from | Start Menu / Desktop shortcut | Applications / Spotlight | App menu, or `machinemaker` in a terminal |
| Build checkout | `%LOCALAPPDATA%\MachineMaker\source` | `~/.machinemaker/source` | `~/.machinemaker/source` |
| Your settings | `%APPDATA%\MachineMaker` | `~/Library/Application Support/MachineMaker` | `~/.config/MachineMaker` |

Updating replaces only the app. Your projects, settings and recent-projects list are never touched.

## Development builds stay separate

Running from a source checkout (`npm run dev`) uses its own data, `MachineMaker Dev`, in every location above. Developing on the same machine can never change or corrupt the data of the version you've installed, and the reverse holds too.

## Options

Set these before running the command:

| Variable | Default | Use |
|---|---|---|
| `MACHINEMAKER_BRANCH` | `prod` | Install a different branch, e.g. `qa` to try a release candidate. |
| `MACHINEMAKER_REPO` | `https://github.com/joshuakirby/MachineMaker.git` | Install from a fork, or from a local clone path. |

```powershell
$env:MACHINEMAKER_BRANCH = "qa"; irm https://raw.githubusercontent.com/joshuakirby/MachineMaker/prod/scripts/install.ps1 | iex
```

```bash
MACHINEMAKER_BRANCH=qa bash -c "$(curl -fsSL https://raw.githubusercontent.com/joshuakirby/MachineMaker/prod/scripts/install.sh)"
```

> **Private repository?** The `raw.githubusercontent.com` URLs only work while the repository is public. For a private repo, clone it with your own credentials and run the script from the clone: `pwsh scripts/install.ps1` or `bash scripts/install.sh`. The script's own `git clone` uses your normal Git credentials.

## Uninstall

**Windows:** delete `%LOCALAPPDATA%\Programs\MachineMaker`, `%LOCALAPPDATA%\MachineMaker`, and the two `MachineMaker` shortcuts (Start Menu and Desktop).

**macOS:** `rm -rf ~/Applications/MachineMaker.app ~/.machinemaker`

**Linux:** `rm -rf ~/.local/share/machinemaker ~/.machinemaker ~/.local/bin/machinemaker ~/.local/share/applications/machinemaker.desktop`

Your settings folders (table above) and your project folders are left in place. Delete them too for a completely clean removal.

## Building it yourself

For development rather than installation, see the [README](../README.md#development).
