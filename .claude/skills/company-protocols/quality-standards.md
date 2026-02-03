# Quality Standards

## Code Quality

### General Principles
- **Readability**: Code should be self-documenting
- **Simplicity**: Prefer simple solutions over clever ones
- **Consistency**: Follow existing project patterns
- **Testability**: Write code that's easy to test

### Code Style
- Follow the project's established style guide
- Use consistent naming conventions
- Keep functions focused (single responsibility)
- Limit function length (<50 lines recommended)
- Limit file length (<500 lines recommended)

### Security
- Never hardcode secrets or credentials
- Validate all user input
- Use parameterized queries (no SQL injection)
- Escape output (no XSS)
- Implement proper authentication/authorization
- Log security events (but not sensitive data)

### Error Handling
- Handle errors explicitly
- Provide meaningful error messages
- Don't swallow exceptions silently
- Use appropriate error types
- Log errors with context

## Testing Standards

### Coverage Requirements

| Test Type | Minimum Coverage |
|-----------|------------------|
| Unit | 80% line coverage |
| Integration | Critical paths covered |
| E2E | Happy path + major error cases |
| UI | Visual regression on key screens |

### Test Quality
- Tests should be independent
- Tests should be deterministic
- Tests should be fast (unit <100ms)
- Tests should have clear assertions
- Tests should test behavior, not implementation

### Test Structure
```
describe('[Component/Function]', () => {
  describe('[Method/Scenario]', () => {
    it('should [expected behavior] when [condition]', () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

### What to Test
- Happy path (expected usage)
- Edge cases (boundaries, empty inputs)
- Error cases (invalid inputs, failures)
- Security cases (unauthorized access)

## Documentation Standards

### Code Comments
- Comment the "why", not the "what"
- Keep comments up to date
- Remove commented-out code
- Use JSDoc/docstrings for public APIs

### API Documentation
- Document all endpoints
- Include request/response examples
- Document error responses
- Keep documentation in sync with code

### README Requirements
- Project description
- Setup instructions
- Usage examples
- Configuration options
- Contributing guidelines

## Review Standards

### Code Review Checklist
- [ ] Code compiles/builds without errors
- [ ] All tests pass
- [ ] Code follows style guidelines
- [ ] No obvious security issues
- [ ] Error handling is appropriate
- [ ] Changes are focused and minimal
- [ ] Documentation is updated

### Review Comments
Use conventional prefixes:
- `nit:` - Minor style suggestion
- `question:` - Seeking clarification
- `suggestion:` - Non-blocking improvement
- `issue:` - Should be addressed
- `blocker:` - Must fix before merge

## Performance Standards

### Response Times
- API endpoints: <200ms p95
- Page load: <3s initial, <1s subsequent
- Database queries: <100ms

### Resource Usage
- Memory: No memory leaks
- CPU: Efficient algorithms
- Network: Minimize requests
- Storage: Clean up temporary files

## Accessibility Standards

### WCAG 2.1 Level AA
- Keyboard navigable
- Screen reader compatible
- Sufficient color contrast
- Alternative text for images
- Form labels and error messages

## Git Standards

### Commit Messages
```
type(scope): subject

body (optional)

footer (optional)
```

Types: feat, fix, docs, style, refactor, test, chore

### Branch Naming
- `feature/[ticket]-[description]`
- `bugfix/[ticket]-[description]`
- `hotfix/[ticket]-[description]`

### Pull Request Size
- Ideal: <400 lines changed
- Maximum: 1000 lines (break into smaller PRs)
