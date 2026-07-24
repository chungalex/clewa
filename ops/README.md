# Ops

`keepalive.yml.github-workflow` — daily Supabase keep-alive via GitHub Actions.
The deploy token lacks `workflow` scope, so this file can't be pushed into
`.github/workflows/` from the CLI. To activate: on github.com, create
`.github/workflows/keepalive.yml` with this file's contents (or push it with a
token that has workflow scope). Until then, an external daily scheduled task
performs the same ping.
