# Phase 0: Data Separation Migration Guide

## Overview
This migration ensures all tickets have `location` and `subcounty` set (required fields) to prevent cross-county data mixing and enable proper categorization.

## Prerequisites
- Database backup completed
- All current data is Nyamira-specific
- Prisma schema updated (location and subcounty are now required)

## Migration Steps

### Step 1: Backup Database
```bash
# Create backup before migration
mysqldump -u root -p facility_dashboard > backup_before_location_migration_$(date +%Y%m%d_%H%M%S).sql
```

### Step 2: Run Prisma Migration
```bash
# Generate migration for schema changes
npx prisma migrate dev --name make_ticket_location_subcounty_required

# This will:
# - Update Ticket model: location String (required), subcounty String (required)
# - Add indexes on [location, subcounty] and [subcounty]
# - Apply migration to database
```

**Note**: If migration fails because existing tickets have null values, you'll need to run the data migration script first (Step 3), then run the schema migration.

### Step 3: Migrate Existing Data
```bash
# Run the migration script to set location and subcounty for existing tickets
npx ts-node scripts/migrate-ticket-location-subcounty.ts

# Or if tsx is installed:
npx tsx scripts/migrate-ticket-location-subcounty.ts
```

**What the script does:**
1. Sets all null locations to "Nyamira" (current data is Nyamira-only)
2. Matches tickets to facilities by facility name and location
3. Copies subcounty from matched facility to ticket
4. Sets "Unknown" for tickets without matching facilities (needs manual review)

### Step 4: Verify Migration
```sql
-- Check all tickets have location set
SELECT COUNT(*) FROM tickets WHERE location IS NULL; -- Should be 0

-- Check all tickets have subcounty set
SELECT COUNT(*) FROM tickets WHERE subcounty IS NULL; -- Should be 0

-- Check location distribution
SELECT location, COUNT(*) FROM tickets GROUP BY location;

-- Check subcounty distribution
SELECT location, subcounty, COUNT(*) FROM tickets GROUP BY location, subcounty;

-- Check tickets with "Unknown" subcounty (may need manual review)
SELECT id, facilityName, location FROM tickets WHERE subcounty = 'Unknown';
```

### Step 5: Review "Unknown" Subcounties
Tickets with subcounty = "Unknown" need manual review:
1. Check if facility exists in master list
2. Update subcounty manually if facility is found
3. Or leave as "Unknown" if facility doesn't exist

## Post-Migration Checklist

- [ ] All tickets have location set (no null values)
- [ ] All tickets have subcounty set (no null values)
- [ ] API endpoints require location parameter
- [ ] API endpoints require subcounty in POST requests
- [ ] UI components updated to require location and subcounty
- [ ] Migration script completed successfully
- [ ] Database backup created
- [ ] "Unknown" subcounties reviewed

## Rollback Plan

If migration fails:
```bash
# Restore from backup
mysql -u root -p facility_dashboard < backup_before_location_migration_YYYYMMDD_HHMMSS.sql

# Revert Prisma migration
npx prisma migrate reset
```

## Next Steps

After successful migration:
1. Update UI components to require location and subcounty
2. Update Nyamira Dashboard to be location-aware
3. Test ticket creation with location and subcounty
4. Verify analytics use subcounty for categorization
