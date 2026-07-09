/**
 * sqlShim.js — a better-sqlite3-shaped facade over a sql.js database.
 *
 * `dbSchema.js` (formerly electron/db.js) is reused verbatim, so its 45 prepared
 * statements must keep working. This adapts the small slice of the
 * better-sqlite3 API that file actually uses:
 *
 *   db.prepare(sql).run(...) / .get(...) / .all(...)
 *   db.exec(sql)
 *   db.pragma(str)
 *   db.transaction(fn) -> (...args) => result
 *
 * Both binding styles are supported: positional (`?`) and named (`@name`), which
 * db.js uses interchangeably.
 */

/** better-sqlite3 rejects `undefined`; sql.js wants null. Booleans → 0/1. */
function coerce(v) {
  if (v === undefined) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  return v
}

const isNamedBag = a =>
  a !== null && typeof a === 'object' && !Array.isArray(a) && !ArrayBuffer.isView(a)

/**
 * sql.js binds named parameters with their sigil included (`{'@name': v}`), and
 * db.js passes bare keys (`{name: v}`). Recover the sigil from the SQL itself,
 * so `@name`, `:name` and `$name` all work.
 */
function bindArgs(sql, args) {
  if (args.length === 1 && isNamedBag(args[0])) {
    const out = {}
    for (const [k, v] of Object.entries(args[0])) {
      const sigil = sql.includes(`@${k}`) ? '@' : sql.includes(`:${k}`) ? ':' : sql.includes(`$${k}`) ? '$' : '@'
      out[`${sigil}${k}`] = coerce(v)
    }
    return out
  }
  return args.map(coerce)
}

function makeStatement(sqlDb, sql) {
  const withStmt = (args, fn) => {
    const stmt = sqlDb.prepare(sql)
    try {
      const bound = bindArgs(sql, args)
      // An empty positional array must not be bound — sql.js would clear params.
      if (!Array.isArray(bound) || bound.length > 0) stmt.bind(bound)
      return fn(stmt)
    } finally {
      stmt.free()
    }
  }

  return {
    run: (...args) => withStmt(args, stmt => { stmt.step(); return { changes: sqlDb.getRowsModified() } }),
    get: (...args) => withStmt(args, stmt => (stmt.step() ? stmt.getAsObject() : undefined)),
    all: (...args) => withStmt(args, stmt => {
      const rows = []
      while (stmt.step()) rows.push(stmt.getAsObject())
      return rows
    }),
  }
}

/** Wrap a sql.js `Database` in the better-sqlite3 surface db.js expects. */
export function wrapSqlJs(sqlDb) {
  const api = {
    prepare: sql => makeStatement(sqlDb, sql),

    exec(sql) { sqlDb.run(sql) },

    /**
     * Only `journal_mode` and `foreign_keys` are ever set. WAL is meaningless
     * without a filesystem, so it is swallowed rather than faked.
     */
    pragma(statement) {
      if (/journal_mode/i.test(statement)) return []
      try { sqlDb.run(`PRAGMA ${statement}`) } catch { /* pragma unsupported in wasm */ }
      return []
    },

    /** better-sqlite3 returns a callable; forward its arguments (insertMany takes one). */
    transaction(fn) {
      return (...args) => {
        sqlDb.run('BEGIN')
        try {
          const result = fn(...args)
          sqlDb.run('COMMIT')
          return result
        } catch (err) {
          try { sqlDb.run('ROLLBACK') } catch { /* already unwound */ }
          throw err
        }
      }
    },

    /** Serialize for persistence. */
    export: () => sqlDb.export(),
    close: () => sqlDb.close(),
    _raw: sqlDb,
  }
  return api
}
