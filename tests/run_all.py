"""Keeper Trade release gate. Run before EVERY commit/push:  python -I -X utf8 tests/run_all.py
Add --quick to skip the slow export suites (deep flows, Wrapped video). A push needs a full run that ends in ALL PASS.

Starts the local static server if it isn't running, runs every suite, and exits non-zero on any failure.
A suite fails on: a FAIL / MISMATCH line, a Traceback, a non-zero exit, or a missing final PASS marker.
Screenshots and downloads land in tests/output/ (git-ignored)."""
import os, re, subprocess, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
OUT = os.path.join(HERE, 'output')
PORT = os.environ.get('KT_PORT', '4173')  # run a frozen snapshot on its own port: KT_PORT=4174
BASE = f'http://127.0.0.1:{PORT}/'
os.environ['KT_BASE'] = BASE
# (script, marker that must appear in its output, slow?)
SUITES = [
    ('syntax.py', 'SYNTAX PASS', False),               # every ES module parses and resolves its imports
    ('season_verify.py', 'KPI values match', False),  # Wrapped KPIs vs an independent Python recomputation
    ('season_verify2.py', 'second-pass checks match', False),
    ('matrix.py', 'MATRIX PASS', False),               # every route x dark/light: axe, overflow, errors, raw values
    ('features.py', 'FEATURES ALL PASS', False),       # calculators, offline shell, mock draft, service worker
    ('league_test.py', 'ALL PASS', False),
    ('yahoo_test.py', 'ALL PASS', False),
    ('fly_edge.py', 'passed', False),                  # The Drive "Home Of" edge cases
    ('values_live.py', 'passed', False),               # live-only value sources, <=6 h cadence, open-page refresh, baselines
    ('winprob_calibration.py', 'passed', False),       # win probability: backtest vs real results + sanity laws
    ('live_mode.py', 'passed', False),                 # Drive live mode + Matchup Pill on an in-progress week
    ('wrapped_entry.py', 'passed', False),             # Wrapped entry points + one-time championship prompt
    ('wr_audit.py', 'passed', True),                  # Wrapped: overflow detector, interactions, exports, edge cases
    ('deep.py', 'DEEP ALL PASS', True),                       # animations, Drive exports, AI features, Pulse
]
FAIL = re.compile(r'^(FAIL|\s*MISMATCH|\s*ILLEGAL)|Traceback \(most recent call last\)|SOME FAILED|route\(s\) with issues|\d+ FAILED$', re.M)


def server_up():
    try:
        urllib.request.urlopen(BASE + 'index.html', timeout=3)
        return True
    except Exception:
        return False


def main():
    quick = '--quick' in sys.argv
    os.makedirs(os.path.join(OUT, 'review'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'sleeper_raw'), exist_ok=True)
    server = None
    if not server_up():
        server = subprocess.Popen([sys.executable, '-m', 'http.server', PORT, '--bind', '127.0.0.1'], cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(30):
            if server_up(): break
            time.sleep(0.5)
    results = []
    try:
        for script, marker, slow in SUITES:
            if quick and slow:
                results.append((script, 'SKIPPED', 0, ''))
                continue
            start = time.time()
            proc = subprocess.run([sys.executable, '-I', '-X', 'utf8', '-u', os.path.join(HERE, script)], cwd=OUT, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=1800)
            output = proc.stdout + proc.stderr
            # the suite's own pass count must be complete, e.g. "24/24 passed"
            counts = re.findall(r'(\d+)/(\d+) (?:passed|KPI|second)', output)
            incomplete = any(a != b for a, b in counts)
            ok = proc.returncode == 0 and marker in output and not FAIL.search(output) and not incomplete
            failing = '\n'.join(line for line in output.splitlines() if FAIL.search(line) or 'MISMATCH' in line)[:1500]
            results.append((script, 'PASS' if ok else 'FAIL', round(time.time() - start), failing or ('' if ok else output[-1500:])))
            print(f"{'PASS' if ok else 'FAIL'}  {script:<20} {round(time.time() - start):>4}s", flush=True)
            if not ok: print('      ' + (failing or output[-800:]).replace('\n', '\n      '), flush=True)
    finally:
        if server: server.terminate()
    failed = [r for r in results if r[1] == 'FAIL']
    print('\nRELEASE GATE:', 'ALL PASS' if not failed else f'{len(failed)} SUITE(S) FAILED: ' + ', '.join(r[0] for r in failed), '(quick run: export suites skipped)' if quick else '')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
