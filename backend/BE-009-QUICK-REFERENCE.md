# BE-009: Hierarchy REST API - Quick Reference Card

## 🚀 One-Minute Setup

```bash
cd backend
pip install httpx  # For testing
python validate_hierarchy_api.py  # Verify implementation
pytest tests/integration/test_hierarchy_api.py -v  # Run tests
```

## 📍 Endpoints at a Glance

| Endpoint | Method | Purpose | Status Codes |
|----------|--------|---------|--------------|
| `/api/v1/hierarchy/` | GET | Get tree | 200 |
| `/api/v1/hierarchy/` | POST | Create node | 201, 404, 422 |
| `/api/v1/hierarchy/{id}` | GET | Get node | 200, 404 |
| `/api/v1/hierarchy/{id}` | PATCH | Update node | 200, 404, 422 |
| `/api/v1/hierarchy/{id}` | DELETE | Delete node | 204, 404, 409 |
| `/api/v1/hierarchy/{id}/characteristics` | GET | Get chars | 200, 404 |

## 🔧 Integration Code

```python
from fastapi import FastAPI
from openspc.api.v1.hierarchy import router as hierarchy_router

app = FastAPI()
app.include_router(hierarchy_router, prefix="/api/v1/hierarchy")
```

## 📝 Common Request Examples

### Create Root Node
```bash
curl -X POST http://localhost:8000/api/v1/hierarchy/ \
  -H "Content-Type: application/json" \
  -d '{"parent_id": null, "name": "Factory A", "type": "Site"}'
```

### Create Child Node
```bash
curl -X POST http://localhost:8000/api/v1/hierarchy/ \
  -H "Content-Type: application/json" \
  -d '{"parent_id": 1, "name": "Line 1", "type": "Line"}'
```

### Get Tree
```bash
curl http://localhost:8000/api/v1/hierarchy/
```

### Get Single Node
```bash
curl http://localhost:8000/api/v1/hierarchy/1
```

### Update Node
```bash
curl -X PATCH http://localhost:8000/api/v1/hierarchy/1 \
  -H "Content-Type: application/json" \
  -d '{"name": "Factory A - Renovated"}'
```

### Delete Node
```bash
curl -X DELETE http://localhost:8000/api/v1/hierarchy/3
```

### Get Characteristics (Direct)
```bash
curl http://localhost:8000/api/v1/hierarchy/1/characteristics
```

### Get Characteristics (Include Descendants)
```bash
curl "http://localhost:8000/api/v1/hierarchy/1/characteristics?include_descendants=true"
```

## 🧪 Testing Commands

```bash
# Run all hierarchy tests
pytest tests/integration/test_hierarchy_api.py -v

# Run specific test class
pytest tests/integration/test_hierarchy_api.py::TestCreateHierarchyNode -v

# Run with coverage
pytest tests/integration/test_hierarchy_api.py --cov=openspc.api.v1.hierarchy --cov-report=html

# Run single test
pytest tests/integration/test_hierarchy_api.py::TestGetHierarchyTree::test_get_empty_tree -v
```

## 📦 File Locations

```
backend/
├── src/openspc/api/
│   ├── deps.py                    # Dependency injection
│   └── v1/
│       └── hierarchy.py           # API endpoints
├── tests/integration/
│   └── test_hierarchy_api.py      # Integration tests
├── pyproject.toml                 # Updated with httpx
├── validate_hierarchy_api.py      # Validation script
├── example_hierarchy_app.py       # Example app
├── BE-009-IMPLEMENTATION.md       # Full documentation
├── BE-009-SUMMARY.md              # Implementation summary
└── BE-009-QUICK-REFERENCE.md      # This file
```

## ⚠️ Important Error Codes

### 404 Not Found
- Node doesn't exist
- Parent node doesn't exist when creating

### 409 Conflict
- Trying to delete node with children
- Solution: Delete children first (bottom-up)

### 422 Unprocessable Entity
- Invalid hierarchy type (must be: Site, Area, Line, Cell, Unit)
- Missing required fields (name, type)
- Empty name
- Name too long (max 100 chars)

## 🎯 ISA-95 Hierarchy Types

Valid values for `type` field:
- `Site` - Top level (factory, plant)
- `Area` - Production area
- `Line` - Production line
- `Cell` - Work cell
- `Unit` - Individual equipment

## 💡 Pro Tips

1. **Always check parent exists** before creating child nodes
2. **Delete bottom-up** - leaves first, then parents
3. **Use include_descendants** to get all characteristics in a hierarchy branch
4. **PATCH for partial updates** - only send fields you want to change
5. **Check /docs** for interactive API testing

## 🔍 Quick Validation

```python
# Verify router loaded correctly
python -c "
import sys; sys.path.insert(0, 'src')
from openspc.api.v1.hierarchy import router
print(f'Routes: {len(router.routes)}')
print('All good!' if len(router.routes) == 6 else 'ERROR')
"
```

Expected output:
```
Routes: 6
All good!
```

## 📊 Test Coverage

- **Total Tests:** 47
- **Test Classes:** 7
- **Endpoints Covered:** 6/6 (100%)
- **Error Cases Covered:** All major scenarios

## 🐛 Troubleshooting

### Tests fail with "No module named 'httpx'"
```bash
pip install httpx
```

### Import errors
```bash
# Ensure you're in backend directory
cd backend
pip install -e .
```

### Database errors
```bash
# Tests use in-memory SQLite, no setup needed
# For actual app, ensure database is initialized
```

## ✅ Validation Checklist

Before deploying:
- [ ] Run `python validate_hierarchy_api.py` - passes
- [ ] Run `pytest tests/integration/test_hierarchy_api.py -v` - all pass
- [ ] Router included in app with correct prefix
- [ ] Database connection configured
- [ ] OpenAPI docs accessible at `/docs`

## 📞 Quick Help

**Problem:** Router not found
**Solution:** `sys.path.insert(0, 'src')` or `pip install -e .`

**Problem:** Tests fail
**Solution:** `pip install httpx pytest-asyncio`

**Problem:** 409 on delete
**Solution:** Delete children first

**Problem:** 404 on create
**Solution:** Parent node doesn't exist

---

**Status:** ✅ Complete | **Files:** 8 | **Tests:** 47 | **Lines:** 1,856
