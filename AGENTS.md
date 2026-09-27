# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may all
differ from your training data. Before writing any code, read the relevant guide
in `node_modules/next/dist/docs/`, and heed deprecation notices.

# Separation rule (hard)

Compass Classics is a personal family app. It must never share tables, keys,
config, logs, or code imports with any Newtek client project, including the
newtek repo and its Supabase project. It uses its own Vercel project, its own
env vars, and its own Anthropic key.
