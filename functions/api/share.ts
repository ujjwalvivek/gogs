declare type R2Bucket = any;
declare type PagesFunction<T = any> = (context: any) => Promise<Response>;

interface Env {
  gogs_bench_data: R2Bucket;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.body === null) {
    return new Response("No body", { status: 400 });
  }

  const id = `share-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 4)}`;
  const key = `${id}.json`;

  await env.gogs_bench_data.put(key, request.body, {
    httpMetadata: { contentType: "application/json" },
  });

  return Response.json({ id });
};
