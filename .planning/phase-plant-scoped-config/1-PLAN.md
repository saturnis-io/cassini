---
phase: plant-scoped-config
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/openspc/db/models/plant.py
  - backend/src/openspc/db/models/__init__.py
  - backend/src/openspc/db/models/hierarchy.py
  - backend/src/openspc/db/models/broker.py
  - backend/src/openspc/db/repositories/plant.py
  - backend/src/openspc/db/repositories/__init__.py
  - backend/alembic/versions/20260207_add_plant.py
autonomous: true
must_haves:
  truths:
    - "Database has Plant table with id, name, code, is_active, settings, timestamps"
    - "Hierarchy table has plant_id FK column"
    - "MQTTBroker table has plant_id FK column"
    - "Migration creates Default plant and assigns all existing data"
  artifacts:
    - "backend/src/openspc/db/models/plant.py exists with Plant model"
    - "backend/alembic/versions/20260207_add_plant.py migration file exists"
    - "Migration runs successfully: alembic upgrade head"
  key_links:
    - "Plant.id referenced by Hierarchy.plant_id"
    - "Plant.id referenced by MQTTBroker.plant_id"
---

# Phase plant-scoped-config - Plan 1: Database Foundation

## Objective
Create the Plant model, add plant_id foreign keys to Hierarchy and MQTTBroker, and migrate existing data to a Default plant.

## Tasks

<task type="auto">
  <name>Task 1: Create Plant Model</name>
  <files>backend/src/openspc/db/models/plant.py, backend/src/openspc/db/models/__init__.py</files>
  <action>
    Create Plant SQLAlchemy model in `backend/src/openspc/db/models/plant.py`:

    1. Import Base from hierarchy.py (existing pattern)
    2. Define Plant class with fields:
       - id: Mapped[int] primary key, autoincrement
       - name: Mapped[str] String(100), unique, not null
       - code: Mapped[str] String(10), unique, not null
       - is_active: Mapped[bool] default True
       - settings: Mapped[Optional[dict]] JSON/JSONB field using SQLAlchemy JSON type
       - created_at: Mapped[datetime] server_default=func.now()
       - updated_at: Mapped[datetime] server_default=func.now(), onupdate=func.now()
    3. Add relationship to hierarchies (one-to-many)
    4. Add relationship to brokers (one-to-many)

    Update `backend/src/openspc/db/models/__init__.py`:
    - Import and export Plant model

    Follow existing model patterns in `broker.py` and `hierarchy.py`.
  </action>
  <verify>
    ```bash
    # File exists with Plant class
    grep -q "class Plant" backend/src/openspc/db/models/plant.py

    # Model is exported
    grep -q "Plant" backend/src/openspc/db/models/__init__.py

    # Python syntax is valid
    cd backend && python -c "from openspc.db.models.plant import Plant; print('OK')"
    ```
  </verify>
  <done>
    - Plant model in backend/src/openspc/db/models/plant.py
    - Model exported from __init__.py
    - Fields: id, name, code, is_active, settings, created_at, updated_at
    - Relationships defined for hierarchies and brokers
  </done>
</task>

<task type="auto">
  <name>Task 2: Add plant_id FK to Hierarchy and Broker Models</name>
  <files>backend/src/openspc/db/models/hierarchy.py, backend/src/openspc/db/models/broker.py</files>
  <action>
    Update Hierarchy model in `backend/src/openspc/db/models/hierarchy.py`:

    1. Add import for ForeignKey if not present
    2. Add plant_id column:
       ```python
       plant_id: Mapped[Optional[int]] = mapped_column(ForeignKey("plant.id", ondelete="CASCADE"), nullable=True)
       ```
    3. Add relationship to Plant:
       ```python
       plant: Mapped[Optional["Plant"]] = relationship("Plant", back_populates="hierarchies")
       ```

    Update MQTTBroker model in `backend/src/openspc/db/models/broker.py`:

    1. Add plant_id column:
       ```python
       plant_id: Mapped[Optional[int]] = mapped_column(ForeignKey("plant.id", ondelete="CASCADE"), nullable=True)
       ```
    2. Add relationship to Plant:
       ```python
       plant: Mapped[Optional["Plant"]] = relationship("Plant", back_populates="brokers")
       ```

    Note: plant_id is nullable to allow migration to set it after creating Default plant.
  </action>
  <verify>
    ```bash
    # Hierarchy has plant_id
    grep -q "plant_id" backend/src/openspc/db/models/hierarchy.py

    # Broker has plant_id
    grep -q "plant_id" backend/src/openspc/db/models/broker.py

    # Python syntax is valid
    cd backend && python -c "from openspc.db.models import Hierarchy, MQTTBroker; print('OK')"
    ```
  </verify>
  <done>
    - Hierarchy model has plant_id FK column and plant relationship
    - MQTTBroker model has plant_id FK column and plant relationship
    - Both use CASCADE delete
  </done>
</task>

<task type="auto">
  <name>Task 3: Create Database Migration</name>
  <files>backend/alembic/versions/20260207_add_plant.py</files>
  <action>
    Create Alembic migration file `backend/alembic/versions/20260207_add_plant.py`:

    1. Follow existing migration pattern (see 20260204_add_mqtt_broker.py)
    2. Revision ID: generate unique ID
    3. Down revision: latest existing migration (20260206_add_characteristic_config)

    Upgrade function:
    ```python
    def upgrade() -> None:
        # Create plant table
        op.create_table(
            'plant',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('name', sa.String(100), nullable=False),
            sa.Column('code', sa.String(10), nullable=False),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('settings', sa.JSON(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('name'),
            sa.UniqueConstraint('code'),
        )

        # Add plant_id to hierarchy
        op.add_column('hierarchy', sa.Column('plant_id', sa.Integer(), nullable=True))
        op.create_foreign_key('fk_hierarchy_plant', 'hierarchy', 'plant', ['plant_id'], ['id'], ondelete='CASCADE')

        # Add plant_id to mqtt_broker
        op.add_column('mqtt_broker', sa.Column('plant_id', sa.Integer(), nullable=True))
        op.create_foreign_key('fk_mqtt_broker_plant', 'mqtt_broker', 'plant', ['plant_id'], ['id'], ondelete='CASCADE')

        # Create Default plant
        op.execute("""
            INSERT INTO plant (name, code, is_active, settings)
            VALUES ('Default Plant', 'DEFAULT', true, '{}')
        """)

        # Assign all existing hierarchies to Default plant
        op.execute("""
            UPDATE hierarchy SET plant_id = (SELECT id FROM plant WHERE code = 'DEFAULT')
        """)

        # Assign all existing brokers to Default plant
        op.execute("""
            UPDATE mqtt_broker SET plant_id = (SELECT id FROM plant WHERE code = 'DEFAULT')
        """)
    ```

    Downgrade function:
    ```python
    def downgrade() -> None:
        op.drop_constraint('fk_mqtt_broker_plant', 'mqtt_broker', type_='foreignkey')
        op.drop_column('mqtt_broker', 'plant_id')
        op.drop_constraint('fk_hierarchy_plant', 'hierarchy', type_='foreignkey')
        op.drop_column('hierarchy', 'plant_id')
        op.drop_table('plant')
    ```
  </action>
  <verify>
    ```bash
    # Migration file exists
    test -f backend/alembic/versions/20260207_add_plant.py && echo "File exists"

    # Run migration (will create/update database)
    cd backend && alembic upgrade head

    # Verify Default plant exists
    cd backend && python -c "
    import sqlite3
    conn = sqlite3.connect('openspc.db')
    result = conn.execute('SELECT name, code FROM plant WHERE code = \"DEFAULT\"').fetchone()
    print(f'Default plant: {result}')
    conn.close()
    "
    ```
  </verify>
  <done>
    - Migration file created at backend/alembic/versions/20260207_add_plant.py
    - Plant table created with all columns
    - Hierarchy and MQTTBroker have plant_id FK
    - Default plant created
    - All existing data assigned to Default plant
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] Plant model exists with all required fields
- [ ] Hierarchy and MQTTBroker models have plant_id FK
- [ ] Migration runs successfully with `alembic upgrade head`
- [ ] Default plant exists in database
- [ ] All existing hierarchies and brokers are assigned to Default plant
- [ ] Atomic commit created
