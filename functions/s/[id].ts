declare type R2Bucket = any;
declare type PagesFunction<T = any> = (context: any) => Promise<Response>;

interface Env {
  gogs_bench_data: R2Bucket;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, params } = context;
  const key = `${params.id}.json`;

  const obj = await env.gogs_bench_data.get(key);
  if (obj === null) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(obj.body, {
    headers: { "Content-Type": "application/json" },
  });
};
