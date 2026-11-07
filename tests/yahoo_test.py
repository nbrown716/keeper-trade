import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
REPO = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
import asyncio, json, sys
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright

L = '461.l.12345'
def team_meta(n, name, nick):
    return [{"team_key": f"{L}.t.{n}"}, {"team_id": str(n)}, {"name": name}, [], {"url": "https://football.fantasysports.yahoo.com/"},
            {"team_logos": [{"team_logo": {"size": "large", "url": "x"}}]}, {"managers": [{"manager": {"manager_id": str(n), "nickname": nick}}]}]
TEAMS = [(1, "Alpha Dogs", "ntbrown", 7, 1, 1217.14), (2, "Bravo", "tanake", 5, 3, 1100.5), (3, "Charlie", "stew30", 4, 4, 999.99), (4, "Delta", "dee", 0, 8, 850.0)]
def standings_team(n, name, nick, w, l, pts):
    return {"team": [team_meta(n, name, nick), {"team_points": {"coverage_type": "season", "season": "2026", "total": f"{pts:.2f}"}},
                     {"team_standings": {"rank": str(n), "outcome_totals": {"wins": str(w), "losses": str(l), "ties": "0", "percentage": ".5"}, "points_for": f"{pts:.2f}", "points_against": "1000"}}]}
standings_teams = {str(i): standings_team(*t) for i, t in enumerate(TEAMS)}
standings_teams[str(len(TEAMS))] = standings_team(*TEAMS[0])  # duplicate team must be deduped
standings_teams["count"] = len(TEAMS) + 1
LEAGUE_META = {"league_key": L, "league_id": "12345", "name": "Yahoo Test League", "season": "2026", "current_week": 9, "num_teams": 4}
STANDINGS = {"fantasy_content": {"league": [LEAGUE_META, {"standings": [{"teams": standings_teams}]}]}}

def sb_team(n, pts, proj):
    t = next(t for t in TEAMS if t[0] == n)
    return {"team": [team_meta(n, t[1], t[2]), {"team_points": {"coverage_type": "week", "week": "9", "total": f"{pts:.2f}"}}, {"team_projected_points": {"coverage_type": "week", "week": "9", "total": f"{proj:.2f}"}}]}
SCOREBOARD = {"fantasy_content": {"league": [LEAGUE_META, {"scoreboard": {"week": "9", "0": {"matchups": {
    "0": {"matchup": {"week": "9", "status": "midevent", "0": {"teams": {"0": sb_team(1, 88.4, 110.2), "1": sb_team(2, 71.25, 101), "count": 2}}}},
    "1": {"matchup": {"week": "9", "status": "midevent", "0": {"teams": {"0": sb_team(3, 0, 95), "1": sb_team(4, 12.5, 90), "count": 2}}}},
    "count": 2}}}}]}}
SETTINGS = {"fantasy_content": {"league": [LEAGUE_META, {"settings": [{"draft_type": "live", "num_playoff_teams": "4", "playoff_start_week": "15", "draft_rounds": "15"}]}]}}

def player(pid, full, abbr, pos, slot):
    return {"player": [[{"player_key": f"461.p.{pid}"}, {"player_id": str(pid)}, {"name": {"full": full, "first": full.split()[0], "last": full.split()[-1]}},
                        {"editorial_team_abbr": abbr}, {"display_position": pos}, {"position_type": "O"}],
                       {"selected_position": [{"coverage_type": "week", "week": "9"}, {"position": slot}, {"is_flex": 0}]}]}
ROSTER_SPEC = {
    1: [(33393, "Ja'Marr Chase", "Cin", "WR", "WR"), (30123, "Patrick Mahomes", "KC", "QB", "QB"), (40001, "Bench Guy", "NYJ", "RB", "BN"), (40002, "Hurt Guy", "SF", "WR", "IR"), (40003, "Taxi Rookie", "Det", "TE", "TAXI")],
    2: [(31001, "Justin Jefferson", "Min", "WR", "WR"), (99999, "Unmatched Yahoo Only", "Ari", "RB", "RB")],
    3: [(31002, "Bijan Robinson", "Atl", "RB", "W/R/T")],
    4: [],
}
def roster_team(n):
    t = next(t for t in TEAMS if t[0] == n)
    players = {str(i): player(*p) for i, p in enumerate(ROSTER_SPEC[n])}; players["count"] = len(ROSTER_SPEC[n])
    return {"team": [team_meta(n, t[1], t[2]), {"roster": {"coverage_type": "week", "week": "9", "is_editable": 0, "0": {"players": players}}}]}
ROSTERS = {"fantasy_content": {"league": [LEAGUE_META, {"teams": {**{str(i): roster_team(t[0]) for i, t in enumerate(TEAMS)}, "count": 4}}]}}

def tx_player(pid, full, abbr, pos, data):
    return {"player": [[{"player_key": f"461.p.{pid}"}, {"player_id": str(pid)}, {"name": {"full": full}}, {"editorial_team_abbr": abbr}, {"display_position": pos}], {"transaction_data": data}]}
TRANSACTIONS = {"fantasy_content": {"league": [LEAGUE_META, {"transactions": {
    "0": {"transaction": [{"transaction_key": "461.l.12345.tr.55", "transaction_id": "55", "type": "trade", "status": "successful", "timestamp": "1790000000", "trader_team_key": f"{L}.t.1", "tradee_team_key": f"{L}.t.2"},
                          {"players": {"0": tx_player(31001, "Justin Jefferson", "Min", "WR", [{"type": "trade", "source_type": "team", "source_team_key": f"{L}.t.1", "destination_type": "team", "destination_team_key": f"{L}.t.2"}]),
                                       "1": tx_player(33393, "Ja'Marr Chase", "Cin", "WR", [{"type": "trade", "source_type": "team", "source_team_key": f"{L}.t.2", "destination_type": "team", "destination_team_key": f"{L}.t.1"}]), "count": 2}}]},
    "1": {"transaction": [{"transaction_key": "461.l.12345.tr.56", "transaction_id": "56", "type": "add/drop", "status": "successful", "timestamp": "1790100000", "faab_bid": "12"},
                          {"players": {"0": tx_player(40001, "Bench Guy", "NYJ", "RB", {"type": "add", "source_type": "waivers", "destination_type": "team", "destination_team_key": f"{L}.t.1"}), "count": 1}}]},
    "count": 2}}]}}
LEAGUES = {"fantasy_content": {"users": {"0": {"user": [[{"guid": "G"}], {"games": {"0": {"game": [[{"game_key": "461"}, {"code": "nfl"}, {"season": "2026"}],
    {"leagues": {"0": {"league": [LEAGUE_META]}, "1": {"league": [{"league_key": "461.l.777", "name": "Second <League>", "season": "2026", "current_week": 9}]}, "count": 2}}]}, "count": 1}}]}, "count": 1}}}
EMPTY_SB = {"fantasy_content": {"league": [LEAGUE_META, {"scoreboard": {"week": "1", "0": {"matchups": {"count": 0}}}}]}}
SLEEPER_PLAYERS = {"7564": {"full_name": "Ja'Marr Chase", "team": "CIN", "position": "WR"}, "4046": {"full_name": "Patrick Mahomes", "team": "KC", "position": "QB"},
                   "6794": {"full_name": "Justin Jefferson", "team": "MIN", "position": "WR"}, "9509": {"full_name": "Bijan Robinson", "team": "ATL", "position": "RB"}}

calls = []
async def handle(route):
    req = route.request
    hdr = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Keeper-Session', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Content-Type': 'application/json'}
    if req.method == 'OPTIONS': return await route.fulfill(status=204, headers=hdr)
    u = urlparse(req.url); q = parse_qs(u.query)
    calls.append(u.path + '?' + u.query)
    if u.path == '/yahoo/leagues': body = LEAGUES
    elif u.path == '/yahoo/connect': body = {"status": "unavailable", "reason": "yahoo-config"}; return await route.fulfill(status=503, headers=hdr, body=json.dumps(body))
    elif u.path == '/yahoo/proxy':
        r = q['resource'][0]; wk = q.get('week', ['1'])[0]
        body = {'standings': STANDINGS, 'scoreboard': SCOREBOARD if wk == '9' else EMPTY_SB, 'settings': SETTINGS, 'transactions': TRANSACTIONS, 'rosters': ROSTERS}[r]
    else: return await route.fulfill(status=404, headers=hdr, body='{}')
    await route.fulfill(status=200, headers=hdr, body=json.dumps(body))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); c = await b.new_context(service_workers='block'); pg = await c.new_page()
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
        await c.route('https://keeper-trade-ai.nicholas-brown00.workers.dev/yahoo/**', handle)
        await c.route('https://api.sleeper.app/v1/players/nfl', lambda r: r.fulfill(status=200, headers={'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}, body=json.dumps(SLEEPER_PLAYERS)))
        await pg.goto(_os.environ.get('KT_BASE', 'http://127.0.0.1:4173/') + 'offline.html')
        out = await pg.evaluate("""async () => {
          const y = await import('/js/data/yahoo.js');
          const leagues = await y.listYahooLeagues();
          const bundle = await y.getYahooLeagueBundle('461.l.12345', 9);
          const empty = await y.getYahooLeagueBundle('461.l.12345', 1);
          let config = ''; try { await y.getYahooConnectUrl(); } catch (e) { config = e.message; }
          return { leagues, bundle, emptyMatchups: empty.matchups.length, config, session: localStorage.getItem('kt-yahoo-session:v1') };
        }""")
        bd = out['bundle']; ok = True
        def check(cond, msg):
            nonlocal ok
            print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond
        check([l['id'] for l in out['leagues']] == ['461.l.12345', '461.l.777'], f"league discovery with numeric game keys: {out['leagues']}")
        check(len(bd['rosters']) == 4 and len(bd['users']) == 4, 'duplicate standings team deduped to 4 teams')
        r1 = next(r for r in bd['rosters'] if r['roster_id'] == 1)
        check(r1['settings'] == {'wins': 7, 'losses': 1, 'ties': 0, 'fpts': 1217, 'fpts_decimal': 14}, f"record + fractional points: {r1['settings']}")
        check(r1['starters'] == ['7564', '4046'], f"starters exclude BN/IR/TAXI and map to Sleeper IDs: {r1['starters']}")
        check(r1['reserve'] == ['yahoo:40002'] and r1['taxi'] == ['yahoo:40003'], f"IR -> reserve, TAXI -> taxi: {r1['reserve']} {r1['taxi']}")
        r2 = next(r for r in bd['rosters'] if r['roster_id'] == 2)
        check('yahoo:99999' in r2['players'], 'unmatched player keeps yahoo: id')
        check(next(r for r in bd['rosters'] if r['roster_id'] == 4)['players'] == [], 'empty roster ok')
        u1 = next(u for u in bd['users'] if u['user_id'] == f'{L}.t.1')
        check(u1['display_name'] == 'ntbrown' and u1['metadata']['team_name'] == 'Alpha Dogs', 'manager nickname + team name')
        ms = sorted((m['matchup_id'], m['roster_id'], m['points']) for m in bd['matchups'])
        check(ms == [(1, 1, 88.4), (1, 2, 71.25), (2, 3, 0), (2, 4, 12.5)], f"matchup pairing + week points: {ms}")
        tr = bd['transactions']
        check(tr[0]['type'] == 'trade' and tr[0]['adds'] == {'6794': 2, '7564': 1} and tr[0]['drops'] == {'6794': 1, '7564': 2}, f"trade direction: {tr[0]['adds']} {tr[0]['drops']}")
        check(tr[1]['type'] == 'waiver' and tr[1]['created'] == 1790100000000, f"waiver add mapped: {tr[1]['type']}")
        check(bd['league']['name'] == 'Yahoo Test League' and bd['league']['settings']['playoff_teams'] == 4, 'league settings')
        check(out['emptyMatchups'] == 0, 'empty scoreboard -> no matchups, no crash')
        check('coming soon' in out['config'], f"503 yahoo-config gives honest message: {out['config']}")
        check(bool(out['session']) and len(out['session']) >= 22, 'session id generated (random, not a token)')
        weekly = [c for c in calls if 'resource=standings' in c]
        check(len(weekly) == 1, f"week-independent resources fetched once across 2 weeks (standings calls={len(weekly)})")
        check(len([c for c in calls if '/yahoo/proxy' in c]) == 7, f"bundle fan-out = 5 + 2 per extra week, got {len([c for c in calls if '/yahoo/proxy' in c])}")
        check(not errors, f'no page errors {errors}')
        print('ALL PASS' if ok else 'SOME FAILED')
        await b.close()
if __name__ == "__main__": asyncio.run(main())
