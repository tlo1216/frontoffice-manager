# API keys for the second opinions (optional)

The kit runs without any of this. Add keys only if you want other models reviewing the agent's decisions before it acts. Each key is yours, billed to you, and lives in a file that never leaves your computer.

## What a key is

A key is a long password that lets a program call a model directly, billed per use, usually a few cents per review. It is separate from a chat subscription: ChatGPT Plus and Gemini Pro do not include API credit.

## OpenAI (GPT)

1. Go to platform.openai.com and sign in with your ChatGPT login.
2. Left menu, API keys. Create new secret key, name it "frontoffice", copy it. It starts with `sk-` and is shown once.
3. Settings, Billing: add a card and a small prepaid balance. Five to ten dollars lasts a season at this volume. Without a balance every call fails with "no credits remaining".
4. Model id: the agent can list what your account can reach (`node tools/list-models.mjs`). Pick the strongest reasoning model shown.

## Google (Gemini)

1. Go to aistudio.google.com and sign in.
2. Click the key icon at the bottom left, Create API key. Copy it. It starts with `AIza`.
3. The free tier covers the Flash models and is enough for a few reviews a day. The Pro models need billing enabled on the linked Google Cloud project.
4. Model id: same listing script shows the ids your key can use.

## Anthropic (Claude), if your agent is Codex

1. console.anthropic.com, API keys, create one, add a small balance.
2. Model id from the same listing.

## Where the keys go

Create a file named exactly `.env` in your private repo folder (in Notepad choose "All files" as the type so it is not saved as `.env.txt`). One line each:

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=<model id>
GEMINI_API_KEY=AIza...
GEMINI_MODEL=<model id>
```

`.gitignore` already excludes `.env`, so it is never pushed. Never paste a key into a chat, a screenshot or a text; if one gets exposed, delete it on the provider's page and make a new one.

## Then

Tell the agent the keys are in. It runs `node tools/list-models.mjs` to confirm both work and set the model ids, then every autonomous decision goes through `tools/second-opinion.mjs` and the weighted consensus lands in the decision file. Details in `decisions/README.md`.
