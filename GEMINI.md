# Claude Virtual Company - Gemini CLI

This project uses the Claude Virtual Company (CVC) framework, adapted for Gemini CLI.

## Overview

CVC provides a virtual software development team that works through a structured engineering hierarchy. Each role has specific responsibilities and produces artifacts that feed into the next phase.

## Quick Start

Use the company commands to delegate work:

```
/company "build a REST API for user management"
```

The orchestrator will route your request through the appropriate roles:
1. **CTO** - Technical strategy and architecture decisions
2. **Architect** - System design and component architecture
3. **UI Designer** - UI/UX specifications (if applicable)
4. **Tech Lead** - Feature breakdown and task planning
5. **Developer** - Implementation
6. **QA** - Quality assurance and testing

## Available Commands

### Main Commands
- `/company` - Main orchestrator (routes work through the hierarchy)
- `/company-cto` - Technical strategy and architecture
- `/company-architect` - System design and components
- `/company-ui-designer` - UI/UX design specifications
- `/company-tech-lead` - Feature planning and task breakdown
- `/company-developer` - Implementation and coding
- `/company-qa` - Quality assurance and verification

### Project Management
- `/company-new-project` - Initialize a new project with full PM workflow
- `/company-project-manager` - Project coordination
- `/company-progress` - Check project status
- `/company-plan-phase` - Plan a project phase
- `/company-execute` - Execute a planned phase
- `/company-verify` - Verify phase completion

### Utilities
- `/company-merge` - Merge feature branch
- `/company-roster` - View team roster
- `/company-status` - System status
- `/company-settings` - Configuration

## Project Structure

```
.company/                    # CVC working directory
├── config.json              # Framework configuration
├── state.json               # Current workflow state
├── roster.json              # Team roster
├── governance-matrix.json   # Role permissions
├── artifacts/               # Role deliverables
│   ├── cto/                 # CTO outputs
│   ├── architect/           # Architecture documents
│   ├── ui-designer/         # UI/UX designs
│   ├── tech-lead/           # Feature specs
│   ├── developer/           # Implementation artifacts
│   └── qa/                  # QA reports
├── proposals/               # Approval workflow
│   ├── pending/
│   ├── approved/
│   └── rejected/
├── inboxes/                 # Role communication
│   ├── cto/
│   ├── architect/
│   └── ...
├── tasks/                   # Task storage (MCP server)
│   ├── index.json
│   └── task-*.json
└── audit/                   # Audit trail

.gemini/                     # Gemini CLI configuration
├── context/                 # Role context files
│   ├── company.md
│   ├── company-cto.md
│   └── ...
├── commands/company/        # TOML command definitions
│   ├── company.toml
│   ├── company-cto.toml
│   └── ...
└── settings.json            # MCP server configuration

.planning/                   # Project management
├── STATE.md                 # PM state
├── ROADMAP.md               # Project roadmap
└── ...
```

## Task Management

CVC includes an MCP task server that provides these tools:

- `cvc_task_create` - Create a new task
- `cvc_task_list` - List all tasks
- `cvc_task_get` - Get task details
- `cvc_task_update` - Update task status

Tasks are stored in `.company/tasks/` and persist across sessions.

## Workflow Differences

### Claude Code vs Gemini CLI

| Feature | Claude Code | Gemini CLI |
|---------|-------------|------------|
| Context isolation | Native (`context: fork`) | Sequential with file handoffs |
| Parallel execution | Native (background tasks) | Sequential only |
| Task tools | Native | Via MCP server |
| Hooks | Native | Not supported |
| Tool restrictions | Native | Trust-based guidance |
| Dynamic context | Backtick syntax | Pre-loaded context files |

### Sequential Execution

Gemini CLI executes roles sequentially. The workflow maintains state through:
1. State files (`.company/state.json`)
2. Artifact handoffs (`.company/artifacts/*/handoff-*.md`)
3. Inbox messages (`.company/inboxes/*/`)

After each role completes:
1. Read outputs from the current role's artifacts directory
2. Check for handoff documents
3. Proceed to the next role with the accumulated context

## Configuration

Edit `.company/config.json` to customize:

```json
{
  "company": {
    "name": "My Virtual Company",
    "models": {
      "cto": "opus",
      "architect": "opus",
      "developer": "sonnet"
    }
  },
  "quality": {
    "test_coverage_minimum": 80,
    "require_code_review": true
  },
  "git_flow": {
    "strategy": "gitflow",
    "require_pr": true
  }
}
```

## Getting Started

1. Run `/company-status` to check the installation
2. Review `.company/config.json` for configuration options
3. Start with `/company "your project goal"`

## Documentation

See the full documentation in the `docs/` directory:
- `docs/GEMINI-SETUP.md` - Gemini-specific setup guide
- `docs/PROVIDER-COMPARISON.md` - Feature comparison matrix
