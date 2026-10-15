// A tiny in-memory stand-in for the Supabase query builder, just enough for the
// verification code: select / update / insert / upsert with eq, is, in, or,
// and maybeSingle / single. No network, no database.

type Row = Record<string, any>;
type Filter = (r: Row) => boolean;

export interface FakeCall {
  table: string;
  op: 'select' | 'update' | 'insert' | 'upsert' | 'delete';
  patch?: any;
  matched: number;
}

export function makeFakeDb(seed: Record<string, Row[]> = {}, seedFiles: Record<string, string[]> = {}) {
  const tables = seed;
  const calls: FakeCall[] = [];
  /** Storage: bucket -> file paths. */
  const files = seedFiles;
  const removed: { bucket: string; path: string }[] = [];
  /** Set to make every update fail, to test the error path. */
  const failOn: { update?: boolean; select?: boolean; insert?: boolean; storageRemove?: boolean; storageList?: boolean } = {};

  function from(table: string) {
    let op: FakeCall['op'] = 'select';
    let patch: any;
    let wantSelect = false;
    let wantCount = false;
    let single: null | 'maybe' | 'one' = null;
    let conflict: string | undefined;
    const filters: Filter[] = [];

    const api: any = {
      select(_cols?: string, o?: { count?: string; head?: boolean }) {
        wantSelect = true;
        if (o?.count) wantCount = true;
        return api;
      },
      not(c: string, op: string, v: any) {
        if (op === 'is') filters.push((r) => (r[c] ?? null) !== v);
        else filters.push((r) => r[c] !== v);
        return api;
      },
      lt(c: string, v: any) {
        filters.push((r) => r[c] != null && r[c] < v);
        return api;
      },
      gt(c: string, v: any) {
        filters.push((r) => r[c] != null && r[c] > v);
        return api;
      },
      update(p: any) {
        op = 'update';
        patch = p;
        return api;
      },
      insert(p: any) {
        op = 'insert';
        patch = p;
        return api;
      },
      upsert(p: any, o?: { onConflict?: string }) {
        op = 'upsert';
        patch = p;
        conflict = o?.onConflict;
        return api;
      },
      delete() {
        op = 'delete';
        return api;
      },
      eq(c: string, v: any) {
        filters.push((r) => r[c] === v);
        return api;
      },
      neq(c: string, v: any) {
        filters.push((r) => r[c] !== v);
        return api;
      },
      is(c: string, v: any) {
        filters.push((r) => (r[c] ?? null) === v);
        return api;
      },
      in(c: string, vs: any[]) {
        filters.push((r) => vs.includes(r[c]));
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      maybeSingle() {
        single = 'maybe';
        return exec();
      },
      single() {
        single = 'one';
        return exec();
      },
      then(res: any, rej: any) {
        return exec().then(res, rej);
      },
    };

    function exec(): Promise<{ data: any; error: any }> {
      const rows = (tables[table] ??= []);
      let matched = rows.filter((r) => filters.every((f) => f(r)));

      if (
        (op === 'update' && failOn.update) ||
        (op === 'select' && failOn.select) ||
        ((op === 'insert' || op === 'upsert') && failOn.insert)
      ) {
        calls.push({ table, op, patch, matched: 0 });
        return Promise.resolve({ data: null, error: { message: 'simulated database failure' } });
      }

      if (op === 'update') {
        matched.forEach((r) => Object.assign(r, patch));
      } else if (op === 'insert') {
        const list = Array.isArray(patch) ? patch : [patch];
        list.forEach((p) => rows.push({ ...p }));
        matched = list;
      } else if (op === 'upsert') {
        const list = Array.isArray(patch) ? patch : [patch];
        list.forEach((p) => {
          const hit = conflict ? rows.find((r) => r[conflict!] === p[conflict!]) : undefined;
          if (hit) Object.assign(hit, p);
          else rows.push({ ...p });
        });
        matched = list;
      } else if (op === 'delete') {
        tables[table] = rows.filter((r) => !matched.includes(r));
      }

      calls.push({ table, op, patch, matched: matched.length });

      if (wantCount) return Promise.resolve({ data: null, error: null, count: matched.length } as any);
      let data: any = op === 'select' || wantSelect ? matched.map((r) => ({ ...r })) : null;
      if (single) data = matched.length ? { ...matched[0] } : null;
      if (single === 'one' && !matched.length) {
        return Promise.resolve({ data: null, error: { message: 'no rows' } });
      }
      return Promise.resolve({ data, error: null });
    }
    return api;
  }

  const storage = {
    from(bucket: string) {
      return {
        async list(prefix: string, o: { limit?: number; offset?: number } = {}) {
          if (failOn.storageList) return { data: null, error: { message: 'simulated list failure' } };
          const all = files[bucket] ?? [];
          const children = new Map<string, boolean>(); // name -> isFolder
          for (const path of all) {
            if (!path.startsWith(prefix + '/')) continue;
            const rest = path.slice(prefix.length + 1);
            const slash = rest.indexOf('/');
            if (slash === -1) children.set(rest, false);
            else children.set(rest.slice(0, slash), true);
          }
          const entries = [...children.entries()].map(([name, folder]) => ({ name, id: folder ? null : 'file-id' }));
          const off = o.offset ?? 0;
          return { data: entries.slice(off, off + (o.limit ?? 100)), error: null };
        },
        async remove(paths: string[]) {
          if (failOn.storageRemove) return { data: null, error: { message: 'simulated remove failure' } };
          files[bucket] = (files[bucket] ?? []).filter((p) => !paths.includes(p));
          paths.forEach((path) => removed.push({ bucket, path }));
          return { data: paths.map((name) => ({ name })), error: null };
        },
        async createSignedUrl(path: string) {
          return { data: { signedUrl: `https://signed.example/${bucket}/${path}` }, error: null };
        },
      };
    },
  };

  return { from, storage, tables, files, removed, calls, failOn };
}

export type FakeDb = ReturnType<typeof makeFakeDb>;
