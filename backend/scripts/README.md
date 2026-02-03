# OpenSPC Database Scripts

This directory contains utility scripts for database management and seeding.

## Seed Database Script

The `seed_db.py` script creates initial development data for testing and development.

### Usage

**Seed the database with sample data:**
```bash
python scripts/seed_db.py
```

**Clear the database:**
```bash
python scripts/seed_db.py --clear
```

### Seed Data Structure

The script creates the following hierarchy:
- **Raleigh_Site** (Site)
  - **Bottling_Line_A** (Line)
    - **Fill_Weight** (Characteristic)
      - Manual data entry
      - Subgroup size: 5
      - Target: 500.0g
      - Spec limits: 490.0 - 510.0g
      - Control limits: 493.0 - 507.0g
      - Nelson Rules: 1, 2, 3, 4 enabled
    - **Fill_Volume** (Characteristic)
      - MQTT tag-based
      - Subgroup size: 1
      - Target: 500.0mL
      - Spec limits: 495.0 - 505.0mL
      - Control limits: 497.0 - 503.0mL
      - MQTT topic: `plant/raleigh/line_a/fill_volume`
      - Trigger tag: `plant/raleigh/line_a/trigger`
      - Nelson Rules: 1, 2, 5, 6 enabled

## Alembic Migrations

Database migrations are managed using Alembic. See the main backend documentation for migration commands.
