<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->


# Project rules

- Backend is the user's own external Supabase project (not Lovable Cloud); browser client in `src/integrations/supabase/client.ts` uses the publishable key, server admin client reads `EXT_DB_*` secrets — `SUPABASE_*` secret names are reserved by the platform.
- Every change is committed to GitHub `mahdihemati/Personal-Accounting` branch `main` via the Contents API using `scripts/github-sync.sh` and `GITHUB_FINE_GRAINED_PERSONAL_ACCESS_TOKEN` — user requires direct API commits, never the GitHub integration.
- Schema changes are written as numbered SQL files in `db/` and applied directly to the external database with psql — the platform migration tool only works with Lovable Cloud.
