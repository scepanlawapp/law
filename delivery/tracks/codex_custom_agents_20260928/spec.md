# Codex Custom Agents Specification

## Scope

Make the repository's existing frontend specialist and Spartan/UI guidance available to local Codex clients through Codex-native, project-scoped configuration.

## What

- Add a project `.codex/config.toml` that enables custom-agent workflows.
- Add a `.codex/agents/frontend_developer.toml` custom agent backed by the existing `.github/agents/frontend-developer.agent.md` instructions.
- Add a discoverable `.agents/skills/spartan-ui/SKILL.md` entry that routes Codex to the existing detailed Spartan/UI skill.
- Add an explicit `$frontend-developer` launcher in the skill picker for selecting the custom agent while composing a prompt.
- Document how to invoke the custom agent and how Codex surfaces it.
- Update the always-on project guide and document index with the Codex-native paths.

## Why

The `.github/agents` and `.github/skills` files are useful to GitHub Copilot but are not the native project discovery locations for Codex custom agents and skills. Project-scoped Codex files make the same specialist behavior available without replacing the existing Copilot setup.

## Non-goals

- Rewriting the detailed frontend or Spartan/UI instructions
- Adding speculative backend, database, or testing specialists without an existing source agent
- Changing application runtime behavior
- Replacing `AGENTS.md`, which remains the always-on repository guidance
