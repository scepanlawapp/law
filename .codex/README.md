# Codex project setup

This repository keeps always-on project guidance in [`AGENTS.md`](../AGENTS.md), reusable Codex skills in [`.agents/skills`](../.agents/skills), and project-scoped custom agents in [`.codex/agents`](agents).

## Available custom agents

### `frontend_developer`

Use for Angular 22 screens and components, Spartan/UI composition, Tailwind v4 semantic styling, themes and accents, accessibility, localization, typed reactive forms, and signal-based frontend state.

Example prompts:

```text
Use the frontend_developer agent to implement the client edit dialog. Wait for it, review its result, and finish the task.
```

```text
Have frontend_developer review this page for incorrect Spartan/UI usage and accessibility regressions. Do not change files.
```

Codex custom agents are specialists spawned from the main chat. Name the agent in the prompt when you want it used; the app then shows its agent thread and result. They are not separate entries in the main model picker.

For a visible prompt-composer choice, select the explicit `$frontend-developer` skill. It routes the request to the same custom agent and does not run implicitly.

## Available project skills

- `$frontend-developer` explicitly routes the prompt to the `frontend_developer` custom agent.
- `$spartan-ui` loads the repository's detailed Spartan/UI implementation guide. Codex can also load it automatically when the request clearly matches its description.

Example:

```text
$frontend-developer implement the client edit dialog with the existing API contracts.
```

```text
$spartan-ui refactor the settings form to use the installed Helm field and select primitives.
```

## Loading changes

Trust this repository so Codex can load [`.codex/config.toml`](config.toml). Start a new chat or reload the Codex client after adding or renaming agents or skills.

## Adding another agent

1. Put the detailed shared role instructions in `.github/agents/<name>.agent.md` when GitHub Copilot should use them too.
2. Add `.codex/agents/<name>.toml` with a unique `name`, a precise `description`, and `developer_instructions` that point to the shared role instructions.
3. Keep reusable procedures in `.agents/skills/<skill-name>/SKILL.md`; keep repository-wide rules in `AGENTS.md`.
4. Add the agent to this catalog and validate the TOML before use.
