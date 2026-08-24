// Wrangler generates configured bindings in worker-configuration.d.ts. Secret
// bindings are intentionally absent from wrangler.jsonc, so declare only their
// names here without values.
interface Env {
  readonly SUPABASE_URL?: string;
  readonly SUPABASE_SECRET_KEY?: string;
}

declare namespace Cloudflare {
  interface Env {
    readonly SUPABASE_URL?: string;
    readonly SUPABASE_SECRET_KEY?: string;
  }
}
