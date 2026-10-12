# Northline IT Support Desk

An internal IT helpdesk for three roles: employee, support agent, and admin. Employees submit tickets. Support agents work the queue. Administrators manage people, categories, articles, and reporting.

AI is a feature, not a role. Ticket text is sent to the **Ollama HTTP API** (`/api/chat`) from a Supabase Edge Function. The app does not bundle a model, does not call OpenAI or Gemini, and does not invent a classification when that API is offline. The ticket is still saved, and the support team can continue manually.

## Technology

- React 18, Vite, and JavaScript
- Plain CSS
- React Router
- Supabase Postgres, Auth, and Edge Functions
- Ollama HTTP API
- Lucide React icons
- Recharts on the admin dashboard

There is no Express server, Tailwind, or Bootstrap.

## Folder structure

```text
src/
  components/          Shared layout, tickets, dialogs, and route guards
  pages/               Landing, auth, dashboards, tickets, knowledge base, profile
  services/            Supabase, auth, tickets, comments, AI, knowledge base
  hooks/               Auth session and ticket lists
  styles/              Plain CSS
  lib/                 Validation used by the UI and by node:test
supabase/
  migrations/001_initial_schema.sql
  functions/analyze-ticket/index.ts
  functions/ollama-health/index.ts
public/favicon.svg
```

## Prerequisites

- Node.js 20 or newer
- A Supabase project
- The Supabase CLI when you want to run Edge Functions on your machine
- A reachable Ollama API server, only if you want AI analysis

## Install

```bash
npm install
copy .env.example .env
```

On macOS or Linux, use `cp .env.example .env`.

Fill in the frontend values:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

`VITE_SUPABASE_ANON_KEY` is the Supabase publishable key from Project Settings → API Keys. It is safe to ship in the browser only because Row Level Security limits what it can do. Do not put the service-role key, `OLLAMA_BASE_URL`, or `OLLAMA_MODEL` in this file. Vite would be the wrong place for them, and a `VITE_` prefix would expose them in the browser bundle.

Restart `npm run dev` after changing `.env`.

## Database

In the Supabase SQL editor, run `supabase/migrations/001_initial_schema.sql` on a **new or empty** project.

This file replaces an older TypeScript helpdesk schema. Do not run it on top of that older schema unless you have reset the database. It creates:

- `profiles`, `categories`, `tickets`, `ticket_comments`, `ticket_ai_analysis`, `knowledge_base`, `audit_logs`
- Checks for role, status, priority, and category
- Ticket numbers such as `TKT-001001`
- Row Level Security on every private table
- Functions for status changes, assignment, role changes, dashboard counts, and saved AI output

New accounts are always employees. The signup trigger ignores any role sent from the browser. A direct profile update cannot change `role`.

Create the first administrator from the SQL editor, after that person has signed up:

```sql
select public.bootstrap_first_admin('you@company.com');
```

That function works only while no admin exists, and the API roles cannot execute it. Later role changes are made in **People**, which calls `admin_set_user_role`. An admin cannot remove their own admin access.

### Existing project upgrade

If this Supabase project already has `profiles` and `tickets`, do not run `001_initial_schema.sql` again. Run `supabase/migrations/002_support_features.sql` in the SQL editor instead. It adds comments, knowledge articles, notifications, history, feedback, SLA targets, and private attachments without deleting existing ticket numbers.

That script is not applied until you run it. The Edge Functions are not deployed until you deploy them.

### What each role can read

- Employees read their own tickets, public comments, and AI suggestions on those tickets.
- Agents read tickets assigned to them and unassigned tickets. They do not read another agent's assigned queue.
- Admins read every ticket and the audit log.
- Internal comments stay hidden from employees through a Row Level Security policy, and a trigger forces `is_internal` back to false if an employee submits one.

These policies are in the migration. This repository test checks that the SQL contains them. It does not connect to your database, so apply the migration and then try the app with one user of each role.

## Authentication

Supabase Auth stores passwords. The app never writes a password into `profiles`.

- `/signup` creates an employee.
- `/login` restores the session from the Supabase client, including after a refresh.
- Protected pages wait for the session before rendering.
- A missing or expired session returns the person to sign in.
- If email confirmation is enabled in Supabase, signup asks the person to confirm before the first sign in. For a local trial you can turn confirmation off under Authentication → Providers → Email.

## Ollama API

The model is not run inside this repository. The Edge Function calls whatever Ollama API you configure.

Example server setup:

```bash
ollama pull llama3.2
ollama serve
```

`ollama serve` exposes the local API, usually at `http://127.0.0.1:11434`. Set the model name to a model that the API actually lists. `llama3.2` is not on Ollama Cloud (`https://ollama.com`); `gpt-oss:20b` is, and it returns JSON. `OLLAMA_MODEL` is required because another machine may use a different model.

Set these as Edge Function secrets, not as frontend variables:

```bash
supabase secrets set OLLAMA_BASE_URL=https://ollama.com
supabase secrets set OLLAMA_MODEL=gpt-oss:20b
supabase secrets set ALLOWED_ORIGIN=https://your-app-domain
```

For local functions, copy `supabase/.env.example` to `supabase/.env.local` and serve the functions with that file:

```bash
supabase functions serve analyze-ticket ollama-health --env-file supabase/.env.local
```

Deploy them with:

```bash
supabase functions deploy analyze-ticket
supabase functions deploy ollama-health
```

`analyze-ticket` loads the ticket from the database with the signed-in user's token, so it cannot analyze a ticket the user cannot read. It sends that stored text to `POST {OLLAMA_BASE_URL}/api/chat`, checks the JSON against category, priority, sentiment, steps, confidence, and escalation rules, and only then saves it with the service-role key that Supabase injects into the function runtime. Invalid model output is discarded. The function does not close tickets, change roles, or execute anything on an employee device.

`ollama-health` is limited to agents and admins. It reports whether the API responds and whether the configured model is present. It does not return the server address or secret values.

The browser allows the function origin only when it matches `ALLOWED_ORIGIN`. Local defaults are `http://localhost:5173` and `http://127.0.0.1:5173`.

### Networking

**Local development.** Run Ollama and `supabase functions serve` on the same machine. `http://127.0.0.1:11434` is reachable from that local function process. If the function runtime is inside Docker, `127.0.0.1` points at the container, not your computer. Use a host address the container can reach, such as `http://host.docker.internal:11434`, only on a trusted development network.

**Remote deployment.** A Supabase Edge Function hosted in the cloud cannot open `localhost` on your laptop. Point `OLLAMA_BASE_URL` at an Ollama API that the function can reach through a private network, VPN, or an authenticated tunnel. Keep the API off the public internet. Do not publish port 11434 without authentication, and do not put that address in the React app.

If the API is down, the model is missing, the request times out, or the JSON fails validation, the ticket remains and the screen says analysis is unavailable. Nothing is filled in with a guessed category or priority.

## Run the app

```bash
npm run dev
```

Open `http://localhost:5173`.

| Path | Who |
| --- | --- |
| `/`, `/login`, `/signup` | Public |
| `/dashboard`, `/tickets`, `/tickets/new`, `/tickets/:id`, `/knowledge`, `/profile` | Signed-in users |
| `/agent`, `/queue` | Agents and admins |
| `/admin`, `/admin/tickets`, `/admin/users` | Admins |

Status changes, assignment, priority, category, and reopening go through database functions. Employees can reopen only their own resolved tickets. Resolving or closing requires resolution notes. Moving an unassigned ticket forward assigns it to the agent doing the work.

Initial priority is copied from urgency when the ticket is inserted. An agent can replace it, including with the AI suggestion, after reading the ticket.

## Knowledge base

Admins create, edit, and delete articles. Everyone signed in can search them. Ticket pages only link articles that were loaded from `knowledge_base` for the ticket category or the validated AI category. The model is not asked for article IDs.

## Tests

```bash
npm test
npm run build
```

`npm test` checks validation rules and checks that the migration text enables Row Level Security, blocks self-promotion, hides internal notes, and keeps the service-role write path off the client. It does not create users or call Ollama. After you apply the migration, sign in as each role and confirm:

- An employee sees only their tickets and no internal note control that succeeds against someone else's ticket.
- An agent sees unassigned work and their own assignments, and an internal note does not appear for the employee.
- An admin can change another person's role and cannot drop their own admin role.
- Creating a ticket while Ollama is stopped still returns a ticket number and an unavailable message.

## Common problems

| What you see | What to do |
| --- | --- |
| Supabase environment variables are missing | Set both values in `.env` and restart Vite. |
| Profile is not ready | Apply the migration. The signup trigger creates `profiles`. |
| Permission or role errors | The account is still an employee until `bootstrap_first_admin` or an admin changes it. |
| AI says the API is not configured | Set `OLLAMA_BASE_URL` and `OLLAMA_MODEL` on the function, not in the React `.env`. |
| AI is unreachable from the hosted function | The cloud function cannot use your laptop's localhost. Use a private reachable API. |
| Configured model is not available | Pull that model on the Ollama server, or change `OLLAMA_MODEL` to a model that `/api/tags` lists. |
| Analysis timed out or was rejected | The ticket is unchanged. An agent classifies it manually. No fallback classification is stored. |
| Category cannot be deleted | A ticket or article still uses it. Mark it inactive instead. |
| CORS error from the function | Set `ALLOWED_ORIGIN` to the exact site origin, including `https`. |

## Production

1. Create a Supabase project and run the migration.
2. Set the two `VITE_` variables in the static host.
3. Build with `npm run build` and publish the `dist` folder.
4. Deploy both Edge Functions.
5. Set `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, and `ALLOWED_ORIGIN` with `supabase secrets set`.
6. Keep the Ollama API on a private network. Do not ship the service-role key to the browser.
7. Create the first admin with `bootstrap_first_admin`, then assign agents from People.

The hosted function must be able to open the Ollama API. Localhost on a developer computer is not that path.
