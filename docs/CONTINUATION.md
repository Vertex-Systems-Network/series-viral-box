# Continuation runner

Use Node.js 22.13 or newer. Run from the repository root with a stable state path on durable disk. The runner uses an operator-maintained JSON manifest with a tasks array. Each task has id, command, args, and dependsOn. List dependencies first. Only run a trusted manifest that you reviewed. Commands run with the current account's permissions.

```sh
node scripts/continuation.mjs plan.json state.sqlite supervise
node scripts/continuation.mjs plan.json state.sqlite status
node scripts/continuation.mjs plan.json state.sqlite pause
node scripts/continuation.mjs plan.json state.sqlite resume
```

Supervise starts a separate process for each eligible task and stops once none can be claimed. A pause prevents new claims. On a nonzero task exit, the runner records the task as blocked and proceeds with eligible independent work. Dependencies require done status. An expired lease is marked blocked on the next claim attempt because the previous command could have produced side effects. Reconcile such a task before scheduling a replacement. Keep the database outside Git.

This runner executes a supplied command plan. Start the runner manually when a reviewed command plan is available. During active development sessions, agents use the repository backlog and continue through ready tasks. The user excluded AI scheduling from this chat. Keep credentials out of the manifest.
