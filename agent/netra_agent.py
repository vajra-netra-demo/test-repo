"""TriNetra endpoint discovery agent — read-only.

Enumerates what the org's OAuth-based discovery structurally cannot see:
locally-installed browser extensions and installed software. Reports them
to the backend's /discovery/endpoint-report endpoint, where they're stored
as ordinary SaaSTool rows (source="endpoint") and picked up by the existing
risk-scoring pipeline with no special-casing.

Deliberately does NOT install, remove, or block anything — this is
discovery only. See netra-mvp/agent/README.md for what it does and does not do.

Usage:
    python netra_agent.py --backend-url https://your-netra-host --token <ENDPOINT_AGENT_TOKEN>
    python netra_agent.py --backend-url http://127.0.0.1:8200 --token dev-token --employee "Vijay Baskar" --department Engineering

Schedule it with Windows Task Scheduler or cron — see the README for both.
"""

import argparse
import getpass
import json
import os
import platform
import socket
import subprocess
import sys
import uuid
from pathlib import Path

import urllib.request
import urllib.error


def _stable_device_id() -> str:
    """A device id that survives repeated runs on the same machine, derived
    from the hostname + platform rather than a fresh random uuid each time —
    so repeated check-ins update one EndpointDevice row, not create many."""
    seed = f"{platform.node()}-{platform.system()}"
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, seed))


def _chrome_like_profile_dirs():
    """Returns (browser_name, extensions_root) pairs for Chrome/Edge on
    whichever OS this is running on. Missing paths are simply skipped."""
    home = Path.home()
    system = platform.system()
    candidates = []
    if system == "Windows":
        local = os.environ.get("LOCALAPPDATA", str(home / "AppData" / "Local"))
        candidates.append(("chrome", Path(local) / "Google" / "Chrome" / "User Data"))
        candidates.append(("edge", Path(local) / "Microsoft" / "Edge" / "User Data"))
    elif system == "Linux":
        candidates.append(("chrome", home / ".config" / "google-chrome"))
        candidates.append(("chromium", home / ".config" / "chromium"))
    elif system == "Darwin":
        candidates.append(("chrome", home / "Library" / "Application Support" / "Google" / "Chrome"))
    return [(name, root) for name, root in candidates if root.exists()]


def _resolve_localized_name(name, manifest, version_dir):
    """manifest["name"] is sometimes a "__MSG_key__" placeholder pointing at
    a key in _locales/<locale>/messages.json rather than a literal string —
    Chrome's i18n mechanism for extensions. Look the real string up there;
    fall back to the raw placeholder only if that file/key isn't found."""
    if not name.startswith("__MSG_") or not name.endswith("__"):
        return name
    key = name[len("__MSG_"):-len("__")]
    locales_dir = version_dir / "_locales"
    locale_candidates = [manifest.get("default_locale")] if manifest.get("default_locale") else []
    locale_candidates += ["en", "en_US"]
    for locale in locale_candidates:
        if not locale:
            continue
        messages_path = locales_dir / locale / "messages.json"
        if not messages_path.exists():
            continue
        try:
            messages = json.loads(messages_path.read_text(encoding="utf-8", errors="ignore"))
        except (json.JSONDecodeError, OSError):
            continue
        entry = messages.get(key)
        if entry and entry.get("message"):
            return entry["message"]
    return name


def scan_browser_extensions():
    """Reads installed Chrome/Edge extension manifest.json files directly
    from disk — the real `permissions` array on each manifest maps onto
    risk_engine.py's existing broad-scope detection with no changes needed
    there (see BROAD_SCOPE_MARKERS in app/risk_engine.py)."""
    findings = []
    for browser, user_data_dir in _chrome_like_profile_dirs():
        ext_root = user_data_dir / "Default" / "Extensions"
        if not ext_root.exists():
            continue
        for ext_dir in ext_root.iterdir():
            if not ext_dir.is_dir():
                continue
            for version_dir in ext_dir.iterdir():
                manifest_path = version_dir / "manifest.json"
                if not manifest_path.exists():
                    continue
                try:
                    manifest = json.loads(manifest_path.read_text(encoding="utf-8", errors="ignore"))
                except (json.JSONDecodeError, OSError):
                    continue
                name = manifest.get("name", ext_dir.name)
                name = _resolve_localized_name(name, manifest, version_dir)
                if name.startswith("__MSG_"):
                    name = f"{ext_dir.name} (localized name unavailable)"
                permissions = list(manifest.get("permissions", [])) + list(manifest.get("host_permissions", []))
                author = manifest.get("author", browser)
                if isinstance(author, dict):
                    # manifest.json's "author" field is sometimes an object
                    # ({"email": "..."}) rather than a plain string.
                    author = author.get("email") or browser
                findings.append({
                    "item_type": "browser_extension",
                    "name": name,
                    "vendor": author,
                    "version": manifest.get("version"),
                    "browser": browser,
                    "permissions": permissions,
                    "install_date": None,
                })
                break  # one version per extension is enough signal
    return findings


def scan_installed_software_windows():
    findings = []
    try:
        import winreg
    except ImportError:
        return findings

    uninstall_paths = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ]
    for hive, path in uninstall_paths:
        try:
            key = winreg.OpenKey(hive, path)
        except OSError:
            continue
        for i in range(winreg.QueryInfoKey(key)[0]):
            try:
                subkey_name = winreg.EnumKey(key, i)
                subkey = winreg.OpenKey(key, subkey_name)
                name = winreg.QueryValueEx(subkey, "DisplayName")[0]
            except OSError:
                continue
            try:
                vendor = winreg.QueryValueEx(subkey, "Publisher")[0]
            except OSError:
                vendor = None
            try:
                version = winreg.QueryValueEx(subkey, "DisplayVersion")[0]
            except OSError:
                version = None
            try:
                install_date = winreg.QueryValueEx(subkey, "InstallDate")[0]  # YYYYMMDD
                install_date = f"{install_date[0:4]}-{install_date[4:6]}-{install_date[6:8]}"
            except (OSError, IndexError, ValueError):
                install_date = None
            findings.append({
                "item_type": "installed_software",
                "name": name,
                "vendor": vendor,
                "version": version,
                "browser": None,
                "permissions": [],
                "install_date": install_date,
            })
    return findings


def _software_finding(name, version):
    return {
        "item_type": "installed_software", "name": name, "vendor": None,
        "version": version, "browser": None, "permissions": [], "install_date": None,
    }


def _run_pkg_query(cmd, parse_line, timeout=15):
    """Runs one package-manager query command and parses its output into
    findings, or returns None if that package manager isn't present/failed
    (FileNotFoundError means "not this distro's package manager" — not
    an error, just try the next one in the chain)."""
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    if out.returncode != 0:
        return None
    findings = []
    for line in out.stdout.strip().splitlines():
        parsed = parse_line(line)
        if parsed:
            findings.append(_software_finding(*parsed))
    return findings


def _parse_tab_separated(line):
    parts = line.split("\t")
    return (parts[0], parts[1]) if len(parts) == 2 else None


# dpkg's own Priority field distinguishes core OS/package-manager
# infrastructure (apt, dpkg, base-files, coreutils, ...) from genuinely
# optional/extra software a user or admin actually chose to install. A real
# system carries hundreds of the former and comparatively few of the
# latter -- without this filter, every endpoint report was dominated by
# low-level system libraries that carry no real "shadow IT" signal and,
# having no vendor and near-identical metadata, produced near-duplicate
# risk reasoning across most findings. Flagged directly by the hackathon
# mentor testing against his own real Linux server: apt itself (priority
# "important") showed up as a discovered "tool", and most other findings
# read as the same generic finding repeated. Using dpkg's own
# classification is more principled than an arbitrary name blocklist.
_DPKG_SKIP_PRIORITIES = {"required", "important", "standard"}


def _parse_dpkg_line(line):
    parts = line.split("\t")
    if len(parts) != 3:
        return None
    name, version, priority = parts
    if priority.strip().lower() in _DPKG_SKIP_PRIORITIES:
        return None
    return (name, version)


def _parse_pacman_line(line):
    # `pacman -Q` prints "name version" (space-separated) — package names
    # never contain spaces, so a single split is unambiguous.
    parts = line.split(" ", 1)
    return (parts[0], parts[1]) if len(parts) == 2 else None


_APK_NAME_VERSION_RE = None


def _parse_apk_line(line):
    # `apk info -v` prints "name-version-release" concatenated with no
    # separator (e.g. "bash-5.2.15-r5") — Alpine has no built-in way to get
    # a delimited name/version pair the way dpkg/rpm/pacman do. Splitting on
    # the last run of "-<digit...>" is a best-effort heuristic, not exact:
    # it can misparse a package whose *name* itself ends in a hyphen+digits
    # segment. Good enough for a discovery signal; not represented as more
    # precise than that.
    global _APK_NAME_VERSION_RE
    if _APK_NAME_VERSION_RE is None:
        import re
        _APK_NAME_VERSION_RE = re.compile(r"^(.+?)-(\d[\w.]*(?:-r\d+)?)$")
    m = _APK_NAME_VERSION_RE.match(line.strip())
    return (m.group(1), m.group(2)) if m else None


def scan_installed_software_linux():
    # Tried in order; first package manager actually present on this distro
    # wins. Covers the two major enterprise/desktop families (dpkg for
    # Debian/Ubuntu, rpm for RHEL/Fedora/CentOS/SUSE) plus Arch (pacman) and
    # Alpine (apk) — a FileNotFoundError from any of these just means "not
    # this distro," not a real failure, so the chain continues silently.
    chain = [
        (["dpkg-query", "-W", "-f=${Package}\\t${Version}\\t${Priority}\\n"], _parse_dpkg_line),
        (["rpm", "-qa", "--qf", "%{NAME}\\t%{VERSION}\\n"], _parse_tab_separated),
        (["pacman", "-Q"], _parse_pacman_line),
        (["apk", "info", "-v"], _parse_apk_line),
    ]
    for cmd, parser in chain:
        findings = _run_pkg_query(cmd, parser)
        if findings is not None:
            return findings
    return []


def scan_installed_software():
    system = platform.system()
    if system == "Windows":
        return scan_installed_software_windows()
    if system == "Linux":
        return scan_installed_software_linux()
    return []  # macOS installed-software enumeration not implemented


def build_report(employee, department, agent_version="0.1.0"):
    findings = scan_browser_extensions() + scan_installed_software()
    return {
        "device_id": _stable_device_id(),
        "hostname": socket.gethostname(),
        "os": platform.system().lower(),
        "employee": employee,
        "department": department,
        "agent_version": agent_version,
        "findings": findings,
    }


def submit(backend_url: str, token: str, report: dict, timeout: int = 30):
    url = backend_url.rstrip("/") + "/discovery/endpoint-report"
    data = json.dumps(report).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


# OS accounts that identify a shared/service session, not a real person.
# Auto-detecting one of these as "employee" would be worse than leaving it
# blank: every server logged in as the same generic account would collapse
# into one bogus "employee" in the dashboard, merging unrelated machines'
# findings together (EndpointDevice/employee lookups match on this string).
_GENERIC_ACCOUNTS = {"administrator", "system", "root", "admin", "guest"}


def _detect_employee():
    username = getpass.getuser()
    if username.lower() in _GENERIC_ACCOUNTS:
        return None
    return username


def main():
    parser = argparse.ArgumentParser(description="TriNetra read-only endpoint discovery agent")
    parser.add_argument("--backend-url", required=True, help="e.g. https://your-netra-host or http://127.0.0.1:8200")
    parser.add_argument("--token", required=True, help="Must match the backend's ENDPOINT_AGENT_TOKEN")
    parser.add_argument(
        "--employee", default=None,
        help="Employee name/email this device belongs to. Never required: if omitted, the "
             "OS-logged-in username on THIS machine is used automatically (unless it's a "
             "shared/generic account like Administrator, in which case it's left blank rather "
             "than guessed). The identical command works unchanged on every machine.",
    )
    parser.add_argument("--department", default=None)
    parser.add_argument("--dry-run", action="store_true", help="Scan and print the report without submitting it")
    args = parser.parse_args()

    employee = args.employee or _detect_employee()
    report = build_report(employee, args.department)

    if args.dry_run:
        print(json.dumps(report, indent=2))
        return

    try:
        result = submit(args.backend_url, args.token, report)
    except urllib.error.HTTPError as e:
        print(f"Submission failed: HTTP {e.code} — {e.read().decode('utf-8', errors='ignore')}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Submission failed: {e.reason}", file=sys.stderr)
        sys.exit(1)

    print(f"Reported {result['findings_ingested']} findings for device {result['device_id']}")


if __name__ == "__main__":
    main()
