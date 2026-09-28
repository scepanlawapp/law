---
name: frontend-developer
description: Explicitly route an Angular frontend implementation or review request to this repository's frontend_developer custom Codex agent.
---

# Frontend developer agent launcher

Delegate the user's scoped request to the `frontend_developer` custom agent. Include the user's requirements and relevant context, wait for the agent to finish, then review and integrate its result before replying.

Do not broaden the task or start additional agents unless the user requests parallel work. If custom-agent delegation is unavailable, follow [the shared frontend role](../../../.github/agents/frontend-developer.agent.md) directly and tell the user that the fallback was used.
