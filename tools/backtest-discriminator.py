"""Backtest the proposed discriminator on real projects, leave-one-project-out.

Every case is: a key that has more than one answer across projects, the answer one project used, and the
context of the positions where that project used it. Nothing is hand-written per key: the predictor only
knows generic features, and learns how reliable each one is per kind from the OTHER projects.

  docker cp tools/backtest-discriminator.py datajoin-mcp:/tmp/b.py && docker exec datajoin-mcp python /tmp/b.py kin 3
  (modes: agree = every signal must agree, first = first signal wins, kin = same-project neighbours only)
"""
import glob, os, re, sqlite3, json, sys
MODE = sys.argv[1] if len(sys.argv) > 1 else 'agree'
KIN_MIN = int(sys.argv[2]) if len(sys.argv) > 2 else 3
from collections import Counter, defaultdict

db = sqlite3.connect('file:/data/products.db?mode=ro', uri=True)

# --- per project: ET ref -> codes/families, and positions with their context ---
mirrors = {}
for f in glob.glob('/data/mirrors/*-psr*.db'):
    p = os.path.basename(f).split('-')[0]
    if p not in mirrors or 'nospec' in mirrors[p]:
        mirrors[p] = f

et_codes, et_fam, maker = defaultdict(set), {}, {}
for code, fam, ref, proj, mk in db.execute(
        "select code_uc, family, ref, project, maker_key from exemplars where project is not null and ref is not null"):
    et_codes[(proj, ref)].add(code)
    if fam:
        et_fam[(proj, ref)] = fam
    maker[code] = mk or ''

def positions(proj):
    c = sqlite3.connect(f'file:{mirrors[proj]}?mode=ro', uri=True)
    rows = c.execute("select ContextType, ContextRef, EntityRef from Recipes where coalesce(IsDeleted,'')=''").fetchall()
    kids = defaultdict(list)
    for t, ctx, ent in rows:
        kids[(t, ctx)].append(ent)
    def ets(t, ref, seen):
        for e in kids.get((t, ref), []):
            if e and e not in seen:
                seen.add(e)
                ets('ElementType', e, seen)
        return seen
    cols = [r[1] for r in c.execute('pragma table_info(PositionTypes)')]
    want = [k for k in ('ControlTypeRef', 'DriverLocation', 'SecondaryPowerType') if k in cols]
    out = {}
    for row in c.execute(f"select Ref{''.join(', ' + k for k in want)} from PositionTypes where coalesce(IsDeleted,'')=''"):
        out[row[0]] = (ets('PositionType', row[0], set()), dict(zip(want, row[1:])))
    return out

def stem(code, n=7):
    return re.sub(r'[^A-Z0-9]', '', code.upper())[:n]

cases = []   # (kind, key, project, chosen, context dict)
for proj in sorted(mirrors):
    try:
        pos = positions(proj)
    except sqlite3.OperationalError:   # no recipes workbook: only the project's ElementTypes are known
        pos = {'(no recipes)': ({r for (p, r) in et_codes if p == proj}, {})}
    code_fam = {c: et_fam[(p, r)] for (p, r), cs in et_codes.items() if p == proj and (p, r) in et_fam for c in cs}
    proj_fams = Counter(et_fam[(proj, r)] for (p, r) in et_fam if p == proj)
    for pref, (refs, attrs) in pos.items():
        codes = {c for r in refs for c in et_codes.get((proj, r), ())}
        fams = {et_fam[(proj, r)] for r in refs if (proj, r) in et_fam}
        tokens = {f'ctl:{v}' for k, v in attrs.items() if v and k == 'ControlTypeRef'} | \
                 {f'{k}:{v}' for k, v in attrs.items() if v and k != 'ControlTypeRef'} | \
                 {f'cofam:{f}' for f in fams} | {f'maker:{maker.get(c, "")}' for c in codes}
        for r in refs:
            for code in et_codes.get((proj, r), ()):
                ctx = {'tokens': tokens - {f'cofam:{et_fam.get((proj, r))}'},
                       'codes': codes - {code}, 'self': code,
                       'kin': {c: f for c, f in code_fam.items() if c != code},
                       # the project's dialect, minus what this ET itself contributes
                       'present': {f for f, n in proj_fams.items() if n - (f == et_fam.get((proj, r))) > 0}}
                if (proj, r) in et_fam:
                    cases.append(('family', code, proj, et_fam[(proj, r)], ctx, pref))

# successors: a retired code with several replacements; the project used one of them
succ = defaultdict(set)
for old, new in db.execute("select old_uc, new_code from supersessions"):
    succ[old].add(new.upper())
rival_of = {n: old for old, ns in succ.items() if len(ns) > 1 for n in ns}
for kind, code, proj, chosen, ctx, pref in list(cases):
    if code in rival_of:
        cases.append(('swap', rival_of[code], proj, code, {**ctx, 'present': set()}, pref))

# collapse to one case per (kind, key, project, position) and keep keys answered on 2+ projects
seen, uniq = set(), []
for c in cases:
    k = (c[0], c[1], c[2], c[5])
    if k not in seen:
        seen.add(k); uniq.append(c)
by_key = defaultdict(list)
for c in uniq:
    by_key[(c[0], c[1])].append(c)
contested = {k: v for k, v in by_key.items()
             if len({c[3] for c in v}) > 1 and len({c[2] for c in v}) > 1}

# --- generic features: each says "pick this option" or nothing ---
def f_present(opts, ctx):     # the option is already used elsewhere in this project (dialect, or the part itself)
    hit = [o for o in opts if o in ctx['present'] or o in ctx['codes']]
    return hit[0] if len(hit) == 1 else None

def f_stem(opts, ctx):        # the option shares its stem with a code already in the position
    hit = [o for o in opts if any(stem(o) == stem(c) for c in ctx['codes'])]
    return hit[0] if len(hit) == 1 else None

def f_kin(opts, ctx):         # what this project does with its codes most like this one (may be an answer nobody else used)
    me = stem(ctx['self'], 99)
    for n in range(len(me), KIN_MIN - 1, -1):
        near = [f for c, f in ctx.get('kin', {}).items() if stem(c, 99)[:n] == me[:n]]
        if len(near) >= 2:
            top, k = Counter(near).most_common(1)[0]
            return top if k / len(near) >= 0.8 else None
    return None

GENERIC = {'present': f_present, 'stem': f_stem, 'kin': f_kin}

def stump(train, ctx, min_proj=2, purity=0.9):
    """The one context token that best separates the options in the other projects' cases."""
    best = None
    for t in ctx['tokens']:
        with_t = [c for c in train if t in c[4]['tokens']]
        if len({c[2] for c in with_t}) < min_proj:
            continue
        top, n = Counter(c[3] for c in with_t).most_common(1)[0]
        if n / len(with_t) >= purity and (best is None or len(with_t) > best[1]):
            best = (top, len(with_t), t)
    return best

def reliability(kind, name, exclude_proj):
    """How often a generic feature was right, per kind, on every OTHER project's contested cases."""
    ok = tot = 0
    for (k, key), cs in contested.items():
        if k != kind:
            continue
        opts = {c[3] for c in cs}
        for c in cs:
            if c[2] == exclude_proj:
                continue
            p = GENERIC[name](opts, c[4])
            if p is not None:
                tot += 1; ok += p == c[3]
    return ok / tot if tot >= 5 else 0, tot

res = defaultdict(Counter)
sig = Counter()
base_unit = defaultdict(set)
per = defaultdict(set)
examples = defaultdict(list)
for (kind, key), cs in contested.items():
    for c in cs:
        train = [x for x in cs if x[2] != c[2]]
        opts = {x[3] for x in train}
        novel = c[3] not in opts              # nobody else ever chose it: only "Maybe" or silence is right
        base = Counter(x[3] for x in train).most_common(1)[0][0]
        res[kind]['base_ok' if base == c[3] else 'base_wrong'] += 1
        res[kind]['novel'] += novel
        votes = {}                            # every reliable signal that speaks; any disagreement is a Maybe
        for name in (['kin'] if MODE == 'kin' else GENERIC):
            r, n = reliability(kind, name, c[2])
            p = GENERIC[name](opts, c[4]) if r >= 0.9 else None
            if p is not None:
                votes[f'{name} ({r:.0%} of {n})'] = p
        s = stump(train, c[4]) if MODE != 'kin' else None
        if s:
            votes[f'{s[2]} ({s[1]} cases)'] = s[0]
        pick = next(iter(votes.values())) if len(set(votes.values())) == 1 else None
        why = ' + '.join(votes)
        if MODE == 'first' and votes:
            pick, why = next(iter(votes.items()))[::-1]
        unit = (kind, key, c[2])
        base_unit[unit].add(base == c[3])
        if pick is not None:
            for w in votes:
                sig[(re.sub(r' \(.*', '', w).split(':')[0], pick == c[3])] += 1
        if pick is None:
            res[kind]['maybe'] += 1; per[unit].add('maybe')
        else:
            ok = pick == c[3]
            res[kind]['hit' if ok else 'wrong'] += 1; per[unit].add('hit' if ok else 'wrong')
            if len(examples[(kind, ok)]) < 6:
                examples[(kind, ok)].append(f'{key} on {c[2]} {c[5]}: picked {pick} because {why}; used {c[3]}')

print('contested keys:', Counter(k for k, _ in contested))
for kind, r in res.items():
    print(kind, dict(r))
print('per key x project (worst outcome counts):', Counter(
    'wrong' if 'wrong' in v else 'maybe' if 'maybe' in v else 'hit' for v in per.values()))
print('baseline per key x project:', Counter('right' if all(v) else 'wrong' for v in base_unit.values()))
print('signals (name, right):', sorted(sig.items()))
print('projects:', len({u[2] for u in per}), 'keys:', len({u[1] for u in per}))
for k, v in examples.items():
    print('\n', k)
    print('\n'.join(v))
