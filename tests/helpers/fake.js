// A pretend Supabase for tests.
//
// How it works: the real code writes things like
//   supabase.from("rides").select("*").eq("id", id).maybeSingle()
// and waits for an answer. Here, every step in that chain just returns the
// same builder, and when the code finally waits for the result, it receives
// the next answer that the test lined up with fake.queue(table, answer).
//
// It also records every step, so a test can check WHAT the code asked for.
// Function calls like supabase.rpc("name") use the queue "rpc:name".

export const fake = {
  queues: {}, // table name -> list of answers waiting to be used
  calls: [], // every from(...) or rpc(...) the code made, with its steps

  reset() {
    fake.queues = {};
    fake.calls = [];
  },

  // Line up the answer for the next query on this table
  queue(table, answer) {
    (fake.queues[table] ??= []).push(answer);
  },

  // Every step the code took on this table, e.g. { method: "eq", args: ["id", "abc"] }
  ops(table) {
    return fake.calls.filter((c) => c.table === table).flatMap((c) => c.ops);
  },

  // The stand-in for the real Supabase client
  client: {
    from(table) {
      const record = { table, ops: [] };
      fake.calls.push(record);

      const builder = new Proxy(
        {},
        {
          get(_target, method) {
            // "await builder" asks for .then, so this is where the answer is delivered
            if (method === "then") {
              return (resolve, reject) => {
                const next = fake.queues[table]?.shift();
                if (!next) {
                  // Loud failure: the code made a query the test didn't expect
                  return reject(new Error(`Unexpected query on "${table}" (no answer queued)`));
                }
                resolve(next);
              };
            }
            // Any other step (select, eq, insert, ...) is recorded and chained on
            return (...args) => {
              record.ops.push({ method: String(method), args });
              return builder;
            };
          },
        }
      );

      return builder;
    },

    // supabase.rpc("name", args): the answer comes from fake.queue("rpc:name", answer)
    rpc(name, args) {
      const table = `rpc:${name}`;
      fake.calls.push({ table, ops: [{ method: "rpc", args: [args] }] });
      return {
        then(resolve, reject) {
          const next = fake.queues[table]?.shift();
          if (!next) {
            return reject(new Error(`Unexpected rpc "${name}" (no answer queued)`));
          }
          resolve(next);
        },
      };
    },
  },
};

// ---------- Small helpers shared by the tests ----------

// Two pretend users, shaped like rows from the "users" table
export const RIDER = { id: "rider-1", role: "rider", name: "Asha Rider" };
export const DRIVER = { id: "driver-1", role: "driver", name: "Dev Driver" };

// Builds a request, like the one a browser would send
export function jsonRequest(body, method = "POST") {
  return new Request("http://localhost/api/test", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// The second argument Next.js gives a route that has [id] in its address
export function ctx(id) {
  return { params: Promise.resolve({ id }) };
}