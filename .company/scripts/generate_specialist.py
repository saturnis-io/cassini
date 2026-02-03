#!/usr/bin/env python3
"""
Generates specialist skill files based on domain expertise.
Called by the hiring manager to create new specialists.
"""

import json
import sys
from pathlib import Path
from datetime import datetime

# Domain definitions with expertise details
DOMAINS = {
    'frontend-react': {
        'title': 'React Frontend',
        'description': 'React specialist - components, hooks, state management, and Next.js',
        'expertise': ['React', 'TypeScript', 'Hooks', 'Redux/Zustand', 'Next.js', 'React Testing Library'],
        'file_patterns': 'src/**/*.tsx',
        'lint_command': 'npm run lint --silent 2>/dev/null || true',
        'best_practices': '''
### Component Design
- Use functional components with hooks
- Keep components focused (single responsibility)
- Extract custom hooks for reusable logic
- Use TypeScript for type safety

### State Management
- Use local state for UI-only state
- Use context for shared state
- Use Zustand/Redux for complex app state
- Avoid prop drilling

### Performance
- Use React.memo for expensive components
- Use useMemo/useCallback appropriately
- Lazy load routes and heavy components
- Profile with React DevTools
''',
        'testing': '''
### Unit Tests
- Test component rendering
- Test user interactions
- Test hooks in isolation
- Mock external dependencies

### Integration Tests
- Test component interactions
- Test with React Testing Library
- Test accessibility
'''
    },
    'backend-node': {
        'title': 'Node.js Backend',
        'description': 'Node.js specialist - Express/Fastify, APIs, and server-side development',
        'expertise': ['Node.js', 'Express', 'Fastify', 'TypeScript', 'REST APIs', 'Middleware'],
        'file_patterns': 'src/**/*.ts',
        'lint_command': 'npm run lint --silent 2>/dev/null || true',
        'best_practices': '''
### API Design
- Use RESTful conventions
- Validate all inputs
- Return consistent error formats
- Use proper HTTP status codes

### Code Structure
- Separate routes, controllers, services
- Use dependency injection
- Handle errors with middleware
- Log appropriately

### Security
- Never trust user input
- Use parameterized queries
- Implement rate limiting
- Secure headers with helmet
''',
        'testing': '''
### Unit Tests
- Test services in isolation
- Mock database and external services
- Test edge cases

### Integration Tests
- Test API endpoints with supertest
- Test with real database (test instance)
- Test authentication flows
'''
    },
    'testing-e2e': {
        'title': 'E2E Testing',
        'description': 'E2E testing specialist - Playwright, Puppeteer, and browser automation',
        'expertise': ['Playwright', 'Puppeteer', 'Cypress', 'Browser Automation', 'Visual Testing'],
        'file_patterns': 'tests/**/*.spec.ts',
        'lint_command': 'npm run lint --silent 2>/dev/null || true',
        'best_practices': '''
### Test Design
- Use Page Object Model
- Keep tests independent
- Use stable selectors (data-testid)
- Test user journeys, not implementation

### Reliability
- Wait for elements properly
- Handle flaky tests
- Use retry mechanisms
- Run tests in CI

### Maintenance
- Keep page objects updated
- Remove duplicate tests
- Organize by feature
''',
        'testing': '''
### E2E Test Patterns
- Happy path tests for critical flows
- Error case handling
- Cross-browser testing
- Mobile viewport testing

### Visual Regression
- Baseline screenshots
- Comparison thresholds
- Update baselines intentionally
'''
    }
}

def generate_skill(domain_id):
    """Generate SKILL.md content for a domain."""

    if domain_id in DOMAINS:
        domain = DOMAINS[domain_id]
    else:
        # Generic template for unknown domains
        domain = {
            'title': domain_id.replace('-', ' ').title(),
            'description': f'{domain_id} specialist',
            'expertise': [domain_id],
            'file_patterns': 'src/**/*',
            'lint_command': 'echo "No lint configured"',
            'best_practices': '### Best Practices\nFollow standard best practices for this domain.',
            'testing': '### Testing\nWrite appropriate tests for this domain.'
        }

    skill_content = f'''---
name: company-specialists/{domain_id}
description: {domain['description']}
context: fork
agent: general-purpose
skills:
  - company-protocols
  - company-git-flow
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - TaskCreate
  - TaskUpdate
  - TaskGet
  - TaskList
hooks:
  PostToolUse:
    - matcher:
        tool: Write
        path: "{domain['file_patterns']}"
      command: "{domain['lint_command']}"
    - matcher:
        tool: Edit
        path: "{domain['file_patterns']}"
      command: "{domain['lint_command']}"
user-invocable: false
---

# {domain['title']} Specialist

## Your Expertise
{domain['description']}

## Technologies You Master
{chr(10).join(f'- {tech}' for tech in domain['expertise'])}

## Session Initialization

### Current State
!`cat .company/state.json`

### Your Inbox
!`find .company/inboxes/specialist-{domain_id} -name "*.json" -exec cat {{}} \\; 2>/dev/null || echo "No messages"`

### Your Assignment
$ARGUMENTS

---

## Expertise Self-Evaluation

Before starting work, verify this task matches your expertise.

### Your Domains
- {domain_id}

### If Task Requires Different Expertise
Submit an expertise request proposal and wait for resolution.

---

## Best Practices

{domain['best_practices']}

---

## Testing Requirements

{domain['testing']}

---

## Workflow

1. **Claim the task** - Mark as in_progress
2. **Understand requirements** - Read specs and context
3. **Implement** - Follow best practices above
4. **Test** - Write appropriate tests
5. **Self-review** - Check quality standards
6. **Complete** - Mark task done and create handoff

---

## Handoff

When complete, write to `.company/artifacts/specialist-{domain_id}/`:
- Implementation summary
- Files changed
- Tests added
- Verification commands
'''

    return skill_content

def create_specialist(domain_id, output_dir=None):
    """Create the specialist skill directory and files."""

    if output_dir:
        base_path = Path(output_dir)
    else:
        base_path = Path('.claude/skills/company-specialists') / domain_id

    base_path.mkdir(parents=True, exist_ok=True)

    # Generate and write SKILL.md
    skill_content = generate_skill(domain_id)
    skill_path = base_path / 'SKILL.md'
    skill_path.write_text(skill_content)

    print(f"Created specialist: {skill_path}")
    return str(skill_path)

def update_roster(domain_id, roster_path='.company/roster.json'):
    """Add the new specialist to the roster."""
    roster_file = Path(roster_path)

    if roster_file.exists():
        roster = json.loads(roster_file.read_text())
    else:
        roster = {'specialists': [], 'roles': {}, 'stats': {}}

    # Check if already exists
    existing = [s for s in roster['specialists'] if s['id'] == domain_id]
    if existing:
        print(f"Specialist {domain_id} already in roster")
        return

    # Add new specialist
    domain = DOMAINS.get(domain_id, {})
    roster['specialists'].append({
        'id': domain_id,
        'type': 'hired',
        'skill_path': f'company-specialists/{domain_id}',
        'created': datetime.now().isoformat(),
        'expertise': domain.get('expertise', [domain_id]),
        'description': domain.get('description', f'{domain_id} specialist')
    })

    # Update stats
    roster['stats']['total_specialists_created'] = roster['stats'].get('total_specialists_created', 0) + 1

    roster_file.write_text(json.dumps(roster, indent=2))
    print(f"Added {domain_id} to roster")

def main():
    if len(sys.argv) < 2:
        print("Usage: generate_specialist.py <domain-id> [output-dir]")
        print("\nAvailable domains:")
        for domain_id in DOMAINS:
            print(f"  - {domain_id}")
        print("\n(Other domain IDs will use a generic template)")
        sys.exit(1)

    domain_id = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else None

    # Create specialist
    skill_path = create_specialist(domain_id, output_dir)

    # Update roster
    update_roster(domain_id)

    print(f"\nSpecialist '{domain_id}' created successfully!")
    print(f"Skill: {skill_path}")

if __name__ == '__main__':
    main()
