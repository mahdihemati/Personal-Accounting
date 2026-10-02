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
- Server functions needing the signed-in user use `requireAuth` from `src/lib/auth-middleware.ts` (JWT-verified, RLS-scoped client); `attachAuth` in `src/start.ts` adds the token — identity is never taken from client input.
- AI insights call Gemini directly with the `GEMINI_API_KEY` secret (user's explicit choice); model id lives only in `src/lib/ai-config.ts`. All numbers are computed in code; only aggregates go to the model.
- Voice assistant: browser connects to Gemini Live with a single-use ephemeral token from `getVoiceToken` (server, rate-limited via `voice_sessions`); read tools run in the browser under RLS, writes only after user confirmation — the main Gemini key never reaches the client.
- Voice tool declarations live only in `src/lib/voice/declarations.ts` (pure) and are locked into the ephemeral token setup; if the live model mentions a transaction without `propose_transactions`, the client nudges once, then `extractVoiceTransactions` (text model) fills the confirmation window — the window always appears and saving stays touch-only.
- Asset prices: only `src/lib/prices.functions.ts` (navasan-key / refresh-prices as server functions, not Edge Functions) calls Navasan; per-user keys are AES-GCM encrypted with `SECRETS_ENCRYPTION_KEY` in `user_secrets` (service role only) and never logged or returned. Valuation lives in `assets_summary` of finance-metrics.
- Telegram bot: each user stores their own bot token (AES-GCM encrypted in `telegram_links`, service role only); Telegram calls `/api/public/telegram/$id` verified by a per-user `secret_token`; Gemini only drafts, saving happens solely on the inline "confirm" button — keeps the token server-side and writes user-confirmed.
- Voice settings (model, voice, VAD, reply length) live per user in `voice_settings` (RLS owner-only); `getVoiceToken` validates the chosen model against Google's live model list and returns the effective model+prefs so the browser session matches the locked token.
- Telegram bot questions are answered read-only by `src/lib/telegram-answer.server.ts`: Gemini only picks tools, every number is computed in code from the linked user's rows (filtered by `user_id`) — the bot never writes outside the confirm button.
