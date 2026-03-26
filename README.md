# HelloCigen

A VS Code extension that integrates collaborative AI-powered code generation with VS Live Share.

## Features

- Create and manage VS Live Share collaborative sessions
- AI-powered task breakdown using GPT-4 (divides project into parallel-developable chunks)
- Project-aware AI chat with file context injection
- Track session participants and activity via MongoDB

## Requirements

- VS Live Share extension installed
- OpenAI API key (set via `HELLOCIGEN: Set OpenAI API Key` command)
- MongoDB Atlas URI configured in `src/utils/config.local.ts`

## Commands

| Command | Description |
|---------|-------------|
| `HELLOCIGEN: Launch HelloCigen` | Launch the extension |
| `HELLOCIGEN: Create a Live Share Session` | Start a new collaborative session |
| `CIGEN: Open Project-Aware AI Chat` | Open GPT-4 chat with project context |
| `HELLOCIGEN: Set OpenAI API Key` | Store your OpenAI API key securely |
| `HELLOCIGEN: Clear OpenAI API Key` | Remove stored API key |
| `HELLOCIGEN: Send Active File to Model` | Inject active editor file into chat context |

## Release Notes

### 0.0.1

Initial release.
