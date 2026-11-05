// Shared test helpers.
// Minimal fake of the Cloudflare D1 binding API, covering exactly the four
// statements d1Adapter issues. Lets us test the real SQL path without a network.
export function fakeD1() {
  let row = null; // { data: string, version: number }
  const calls = [];
  return {
    prepare(sql) {
      const s = sql.replace(/\s+/g, " ").trim();
      let args = [];
      const api = {
        bind(...a) { args = a; return api; },
        async first() {
          calls.push(["first", s]);
          if (/^SELECT/i.test(s)) return row ? { data: row.data, version: row.version } : null;
          return null;
        },
        async run() {
          calls.push(["run", s]);
          if (/^CREATE TABLE/i.test(s)) return { meta: { changes: 0 } };
          if (/^INSERT OR IGNORE/i.test(s)) {
            if (row) return { meta: { changes: 0 } };
            row = { data: args[0], version: 1 };
            return { meta: { changes: 1 } };
          }
          if (/^UPDATE/i.test(s)) {
            if (!row || row.version !== args[1]) return { meta: { changes: 0 } };
            row = { data: args[0], version: row.version + 1 };
            return { meta: { changes: 1 } };
          }
          throw new Error("fakeD1: unhandled SQL: " + s);
        },
      };
      return api;
    },
    _row: () => row,
    _calls: calls,
  };
}

