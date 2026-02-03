#!/usr/bin/env python3
"""
Evaluates project/task requirements to identify needed expertise.
Used by the hiring manager to determine what specialists to create.
"""

import json
import re
import sys
from pathlib import Path
from collections import defaultdict

# Technology detection patterns
TECH_PATTERNS = {
    # Frontend frameworks
    'frontend-react': [
        r'react', r'\.jsx', r'\.tsx', r'next\.js', r'next\.config',
        r'react-dom', r'useState', r'useEffect', r'redux', r'zustand'
    ],
    'frontend-vue': [
        r'vue', r'\.vue', r'vuex', r'pinia', r'nuxt', r'composition api'
    ],
    'frontend-angular': [
        r'angular', r'@angular', r'\.component\.ts', r'rxjs', r'ngrx'
    ],
    'frontend-svelte': [
        r'svelte', r'\.svelte', r'sveltekit'
    ],

    # Backend frameworks
    'backend-node': [
        r'express', r'fastify', r'nestjs', r'koa', r'node\.js',
        r'package\.json.*server', r'npm.*start'
    ],
    'backend-python': [
        r'python', r'\.py', r'fastapi', r'django', r'flask',
        r'requirements\.txt', r'pyproject\.toml'
    ],
    'backend-go': [
        r'golang', r'go\.mod', r'\.go', r'gin', r'echo', r'chi'
    ],
    'backend-rust': [
        r'rust', r'cargo\.toml', r'\.rs', r'actix', r'axum', r'rocket'
    ],

    # Databases
    'database-postgresql': [
        r'postgres', r'postgresql', r'pg_', r'psycopg'
    ],
    'database-mongodb': [
        r'mongo', r'mongodb', r'mongoose'
    ],
    'database-redis': [
        r'redis', r'ioredis', r'redis-py'
    ],

    # Infrastructure
    'infra-docker': [
        r'docker', r'dockerfile', r'docker-compose', r'container'
    ],
    'infra-kubernetes': [
        r'kubernetes', r'k8s', r'kubectl', r'helm', r'\.yaml.*kind:'
    ],
    'cloud-aws': [
        r'aws', r'lambda', r's3', r'ec2', r'ecs', r'cloudformation', r'cdk'
    ],
    'cloud-gcp': [
        r'gcp', r'google cloud', r'cloud run', r'firebase', r'gke'
    ],

    # Testing
    'testing-e2e': [
        r'playwright', r'cypress', r'puppeteer', r'e2e', r'end.to.end'
    ],
    'testing-unit': [
        r'jest', r'vitest', r'mocha', r'pytest', r'junit', r'\.test\.'
    ],

    # Other
    'ui-css': [
        r'tailwind', r'css', r'sass', r'styled-components', r'emotion'
    ],
    'security': [
        r'security', r'oauth', r'jwt', r'authentication', r'encryption'
    ]
}

# Keyword to domain mapping
KEYWORDS = {
    'authentication': ['security', 'backend-node'],
    'login': ['security', 'frontend-react'],
    'dashboard': ['frontend-react', 'ui-css'],
    'api': ['backend-node'],
    'database': ['database-postgresql'],
    'real-time': ['backend-node'],
    'machine learning': ['backend-python'],
    'ml': ['backend-python'],
    'ai': ['backend-python'],
    'mobile': ['frontend-react'],
    'responsive': ['ui-css'],
    'testing': ['testing-unit', 'testing-e2e'],
    'deployment': ['infra-docker', 'cicd-github'],
    'ci/cd': ['cicd-github'],
}

def scan_codebase():
    """Scan the codebase for technology indicators."""
    detected = defaultdict(int)

    # Check for config files
    config_checks = [
        ('package.json', ['frontend-react', 'backend-node']),
        ('requirements.txt', ['backend-python']),
        ('go.mod', ['backend-go']),
        ('Cargo.toml', ['backend-rust']),
        ('Dockerfile', ['infra-docker']),
        ('docker-compose.yml', ['infra-docker']),
    ]

    for config_file, domains in config_checks:
        if Path(config_file).exists():
            for domain in domains:
                detected[domain] += 5  # High confidence for config files

    # Read package.json if exists
    pkg_path = Path('package.json')
    if pkg_path.exists():
        try:
            pkg = json.loads(pkg_path.read_text())
            deps = {**pkg.get('dependencies', {}), **pkg.get('devDependencies', {})}

            for dep in deps:
                for domain, patterns in TECH_PATTERNS.items():
                    for pattern in patterns:
                        if re.search(pattern, dep, re.IGNORECASE):
                            detected[domain] += 3
        except:
            pass

    # Scan source files (limited)
    for ext in ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs']:
        for file in list(Path('.').rglob(f'*.{ext}'))[:50]:  # Limit scanning
            try:
                content = file.read_text()[:5000]  # First 5k chars
                for domain, patterns in TECH_PATTERNS.items():
                    for pattern in patterns:
                        if re.search(pattern, content, re.IGNORECASE):
                            detected[domain] += 1
            except:
                pass

    return dict(detected)

def analyze_text(text):
    """Analyze text (goal/description) for technology mentions."""
    detected = defaultdict(int)
    text_lower = text.lower()

    # Check patterns
    for domain, patterns in TECH_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text_lower):
                detected[domain] += 2

    # Check keywords
    for keyword, domains in KEYWORDS.items():
        if keyword in text_lower:
            for domain in domains:
                detected[domain] += 1

    return dict(detected)

def get_current_roster():
    """Get list of currently available specialists."""
    roster_path = Path('.company/roster.json')
    if roster_path.exists():
        roster = json.loads(roster_path.read_text())
        return [s['id'] for s in roster.get('specialists', [])]
    return []

def evaluate(goal_text):
    """
    Evaluate expertise needs for a goal.

    Returns assessment dict.
    """
    # Analyze the goal text
    text_detected = analyze_text(goal_text)

    # Scan codebase
    code_detected = scan_codebase()

    # Combine scores
    combined = defaultdict(int)
    for domain, score in text_detected.items():
        combined[domain] += score
    for domain, score in code_detected.items():
        combined[domain] += score

    # Sort by score
    sorted_domains = sorted(combined.items(), key=lambda x: x[1], reverse=True)

    # Get current roster
    current_roster = get_current_roster()

    # Build assessment
    required = []
    gaps = []

    for domain, score in sorted_domains:
        if score >= 2:  # Threshold for "required"
            priority = 'critical' if score >= 5 else 'high' if score >= 3 else 'medium'
            required.append({
                'domain': domain,
                'priority': priority,
                'confidence': min(score, 10) / 10
            })

            if domain not in current_roster:
                gaps.append({
                    'domain': domain,
                    'priority': priority,
                    'action': 'hire'
                })

    assessment = {
        'detected_stack': {
            'from_text': list(text_detected.keys()),
            'from_codebase': list(code_detected.keys())
        },
        'required_expertise': required[:10],  # Top 10
        'current_roster': current_roster,
        'gaps': gaps[:5],  # Top 5 gaps
        'recommendations': {
            'immediate_hires': [g['domain'] for g in gaps if g['priority'] == 'critical'],
            'suggested_hires': [g['domain'] for g in gaps if g['priority'] != 'critical']
        }
    }

    return assessment

def main():
    if len(sys.argv) < 2:
        print("Usage: evaluate_expertise.py '<goal text>'")
        sys.exit(1)

    goal_text = ' '.join(sys.argv[1:])

    assessment = evaluate(goal_text)

    print(json.dumps(assessment, indent=2))

    # Also write to file
    output_path = Path('.company/artifacts/hiring-manager/assessment.json')
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(assessment, indent=2))

    print(f"\nAssessment written to: {output_path}")

if __name__ == '__main__':
    main()
