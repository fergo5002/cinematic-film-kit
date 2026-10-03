# Notes per agent

Every agent gets the same instructions (`AGENTS.md` and the skill). These notes cover how to start
each one in this folder and what to allow, as documented in October 2026. Agents change quickly:
if one of these is out of date, the agent's own documentation wins.

The kit needs an agent that can **read and write files in this folder** and **run commands**
(`npm`, `node`, `ffmpeg`). Renders take minutes, so allow long-running commands. The agent never
needs network access to make a free film once `npm ci` has run, except to download the headless
browser on the first render.

| Agent | Start it | Allow |
|---|---|---|
| Claude Code | run `claude` in the folder | file edits and the `npm`, `node`, `npx` and `ffmpeg` commands when it asks |
| Codex CLI | run `codex` in the folder | the `workspace-write` sandbox; network for `npm ci` |
| Cursor | open the folder, use the agent | terminal commands when it asks |
| Gemini CLI | run `gemini` in the folder and trust it when asked | shell commands when it asks |
| GitHub Copilot | open the folder in VS Code, Copilot Chat in agent mode | terminal commands when it asks |
| Windsurf | open the folder, use Cascade | terminal commands when it asks |
| Cline | open the folder in VS Code with Cline | commands and file edits; long-running commands |
| OpenCode | run `opencode` in the folder | the `bash` and `edit` tools |
| Aider | run `aider` in the folder | it suggests commands; run them with `/run` |

## Reviews without peeking

The kit's reviews only count if the reviewer has not seen the brief. Agents with subagents
(Claude Code, Codex and others) can send the packet to a fresh subagent. Otherwise start a second
session from inside the packet folder, so it cannot read the project:

```
cd out/<id>/packet
claude -p "$(cat explain-back.md)"                      # Claude Code
codex exec --skip-git-repo-check "$(cat explain-back.md)"   # Codex CLI
```

On Windows PowerShell, use `(Get-Content explain-back.md -Raw)` in place of `$(cat explain-back.md)`.
If the agent has neither, ask the person to upload the packet to a fresh chat.

## Local and free models

Any agent that can run commands can drive the kit, including ones running local models. Films
are code, though, and the craft takes judgement: smaller models will follow the process but
usually produce plainer films. Use the strongest model you have access to for the concept,
treatment and style frames.
