"""Backtest "similar codes in this project" on projects replayed as if half-built.

Finished projects are self-consistent, which flatters a same-project signal. Here each project is cut back
to a random share of its codes (0% = a blank project), and every missing code is predicted from what is
left, then, when nothing similar is left, from the other projects. Several random orders per stage.

  docker cp tools/backtest-inprogress.py datajoin-mcp:/tmp/i.py && docker exec datajoin-mcp python /tmp/i.py
"""
import random, re, sys
STRICT = 'strict' in sys.argv
SINGLE = 'single' in sys.argv                    # also trust ONE neighbour sharing 4+ characters (the old stem rule)
import sqlite3
from collections import Counter, defaultdict

db = sqlite3.connect('file:/data/products.db?mode=ro', uri=True)
votes = defaultdict(Counter)
for code, fam, proj in db.execute("select code_uc, family, project from exemplars where project is not null and family is not null"):
    votes[(proj, code)][fam] += 1
fam_of = defaultdict(dict)                       # project -> code -> family
for (proj, code), c in votes.items():
    fam_of[proj][code] = c.most_common(1)[0][0]
contested = {c for c in {k[1] for k in votes} if len({fam_of[p][c] for p in fam_of if c in fam_of[p]}) > 1}

norm = lambda c: re.sub(r'[^A-Z0-9]', '', c.upper())

def kin(code, known, min_stem=3, purity=0.8):
    """The family the most similar known codes are filed under, or None if they disagree or there are none."""
    me = norm(code)
    for n in range(len(me), min_stem - 1, -1):
        near = [f for c, f in known.items() if norm(c)[:n] == me[:n]]
        if len(near) >= 2 or (SINGLE and near and n >= 4):
            top, k = Counter(near).most_common(1)[0]
            return top if k / len(near) >= purity else None
    return None

# cache "elsewhere" per project: it does not depend on the stage
_else = {}
def predict_fast(proj, code, known):
    p = kin(code, known)
    if p:
        return p, 'project'
    if proj not in _else:
        e = {}
        for q, m in fam_of.items():
            if q != proj:
                for c, f in m.items():
                    e.setdefault(c, Counter())[f] += 1
        _else[proj] = (e, {c: v.most_common(1)[0][0] for c, v in e.items()})
    e, flat = _else[proj]
    ours = set(known.values())                   # another project's answer counts only in a name this project uses
    if code in e:
        top, k = e[code].most_common(1)[0]
        ok = k / sum(e[code].values()) >= 0.8 and (top in ours or not STRICT)
        return (top, 'same code elsewhere') if ok else (None, None)
    p = kin(code, flat)
    return (p, 'similar elsewhere') if p and (p in ours or not STRICT) else (None, None)

projects = [p for p, m in fam_of.items() if len(m) >= 20]
print(f'{len(projects)} projects, {sum(len(fam_of[p]) for p in projects)} code x project, {len(contested)} contested codes')
for stage in (0, 0.1, 0.3, 0.6, 0.9):
    tally = {'all': Counter(), 'contested': Counter()}
    by = Counter()
    for seed in range(3):
        rnd = random.Random(seed)
        for proj in projects:
            codes = sorted(fam_of[proj])
            rnd.shuffle(codes)
            cut = int(len(codes) * stage)
            known = {c: fam_of[proj][c] for c in codes[:cut]}
            for c in codes[cut:]:
                pick, src = predict_fast(proj, c, known)
                out = 'maybe' if pick is None else 'hit' if pick == fam_of[proj][c] else 'wrong'
                tally['all'][out] += 1
                if c in contested:
                    tally['contested'][out] += 1
                if src:
                    by[(src, out)] += 1
    for k, t in tally.items():
        n = sum(t.values())
        print(f'stage {stage:.0%} {k:9}: ' + '  '.join(f'{o} {t[o] / n:5.1%}' for o in ('hit', 'maybe', 'wrong')) + f'  (n={n})')
    print('   by source:', {f'{s}/{o}': v for (s, o), v in sorted(by.items())})
