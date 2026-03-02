# Data Separation Strategy
## Ensuring County-Level Data Isolation

**Document Version:** 1.0  
**Date:** 2024  
**Status:** Critical Implementation Requirement

---

## Current Data State

### ⚠️ IMPORTANT: Current Data is Nyamira-Only

**All existing data in the system is Nyamira-specific:**
- ✅ **Facilities**: Already location-separated (API requires location parameter)
- ⚠️ **Tickets**: Have location field but it's optional - current tickets are all Nyamira
- ⚠️ **Nyamira Dashboard**: Hardcoded to fetch only Nyamira data
- ⚠️ **Tickets Component**: Defaults to "Nyamira" but can show all tickets

**Risk**: When adding other counties, existing Nyamira data could mix with new county data if not properly isolated.

---

## Data Separation Requirements

### 1. Facilities (Already Separated ✅)

**Current Implementation:**
- `Facility` model has `location` field (required)
- API requires `location` parameter: `/api/facilities?system=NDWH&location=Nyamira&isMaster=true`
- Database indexes on `location` for efficient filtering
- ✅ **Status**: Already properly separated

**No changes needed** - Facilities are already location-isolated.

---

### 2. Tickets (Needs Enhancement ⚠️)

**Current Implementation:**
- `Ticket` model has `location` field but it's **optional** (`String?`)
- `Ticket` model does NOT have `subcounty` field (needed for categorization)
- API can return ALL tickets if no location filter provided
- Default location in UI is "Nyamira" but not enforced
- Current tickets may have `location: null` or `location: "Nyamira"`

**Required Changes:**

#### 2.1 Make Location Required
- [ ] Update Ticket model: `location String @db.VarChar(50)` (remove `?`)
- [ ] Add database constraint/index on `location`
- [ ] Update API to require location in POST requests
- [ ] Add validation to prevent tickets without location

#### 2.2 Add Subcounty Field (REQUIRED for Categorization)
- [ ] Add `subcounty` field to Ticket model: `subcounty String @db.VarChar(100)` (REQUIRED)
- [ ] Add database index on `[location, subcounty]` for efficient filtering
- [ ] Update API to require subcounty in POST requests
- [ ] Add validation to prevent tickets without subcounty
- [ ] Update ticket creation form to require subcounty selection
- [ ] Update analytics to use subcounty for categorization

#### 2.2 Data Migration for Existing Tickets
- [ ] Identify all tickets with `location: null`
- [ ] Set them to `location: "Nyamira"` (since all current data is Nyamira)
- [ ] Migration script: `UPDATE tickets SET location = 'Nyamira' WHERE location IS NULL`
- [ ] **For subcounty**: Match tickets to facilities to get subcounty
  - Find matching facility by `facilityName`
  - Copy `subcounty` from facility to ticket
  - For tickets without matching facility, set to "Unknown" or prompt for manual entry
- [ ] Migration script: 
  ```sql
  -- Match tickets to facilities and copy subcounty
  UPDATE tickets t
  INNER JOIN facilities f ON t.facilityName = f.name AND t.location = f.location
  SET t.subcounty = f.subcounty
  WHERE t.subcounty IS NULL AND f.subcounty IS NOT NULL;
  
  -- Set remaining null subcounties to "Unknown" (will need manual review)
  UPDATE tickets SET subcounty = 'Unknown' WHERE subcounty IS NULL;
  ```

#### 2.3 API Enforcement
- [ ] Update `GET /api/tickets` to require location filter (or default to showing all with clear indication)
- [ ] Update `POST /api/tickets` to require location field
- [ ] Add validation: reject tickets without location

#### 2.4 UI Enforcement
- [ ] Make location selector required in ticket creation form
- [ ] Default to "Nyamira" for backward compatibility
- [ ] Add location badge/indicator on all tickets
- [ ] Filter tickets by location by default

---

### 3. Nyamira Dashboard (Hardcoded - Needs Refactoring)

**Current Implementation:**
- Hardcoded to fetch only Nyamira data:
  - `fetch("/api/facilities?system=NDWH&location=Nyamira&isMaster=true")`
  - `fetch("/api/tickets?location=Nyamira")`
  - `fetch("/api/comparisons?system=CBS&location=Nyamira")`

**Required Changes:**
- [ ] Convert to accept `location` parameter/prop
- [ ] Make all data fetching location-aware
- [ ] When converting to multi-county dashboard, ensure location is always specified
- [ ] Add location validation to prevent data mixing

---

## Implementation Strategy

### Phase 1: Data Migration & Validation (CRITICAL - Do First)

#### Step 1.1: Migrate Existing Ticket Data
```sql
-- Set all null locations to Nyamira (current data state)
UPDATE tickets SET location = 'Nyamira' WHERE location IS NULL;

-- Verify migration
SELECT COUNT(*) FROM tickets WHERE location IS NULL; -- Should be 0
SELECT location, COUNT(*) FROM tickets GROUP BY location; -- Should show all Nyamira
```

#### Step 1.2: Update Database Schema
```prisma
model Ticket {
  // ... existing fields ...
  location        String    @db.VarChar(50) // REQUIRED - Remove optional (?)
  // ... rest of fields ...
  
  @@index([location]) // Add index for efficient filtering
  @@index([location, status]) // Composite index for common queries
}
```

#### Step 1.3: Add Data Validation
- [ ] Create validation middleware for ticket creation
- [ ] Ensure location is always provided
- [ ] Validate location is one of: Kakamega, Vihiga, Nyamira, Kisumu
- [ ] **Ensure subcounty is always provided**
- [ ] Validate subcounty exists for the selected location (or allow free text with validation)
- [ ] Add database constraint if possible

---

### Phase 2: API Enforcement

#### Step 2.1: Update Ticket API
```typescript
// GET /api/tickets
// REQUIRE location parameter or return error
export async function GET(request: NextRequest) {
  const location = searchParams.get("location")
  
  if (!location) {
    return NextResponse.json(
      { error: "Location parameter is required" },
      { status: 400 }
    )
  }
  
  // Validate location is valid
  const validLocations = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"]
  if (!validLocations.includes(location)) {
    return NextResponse.json(
      { error: "Invalid location" },
      { status: 400 }
    )
  }
  
  // Query with location filter
  const tickets = await prisma.ticket.findMany({
    where: { location },
    // ...
  })
}

// POST /api/tickets
// REQUIRE location and subcounty in body
export async function POST(request: NextRequest) {
  const { location, subcounty, ...otherFields } = await request.json()
  
  if (!location) {
    return NextResponse.json(
      { error: "Location is required" },
      { status: 400 }
    )
  }
  
  if (!subcounty) {
    return NextResponse.json(
      { error: "Subcounty is required for categorization" },
      { status: 400 }
    )
  }
  
  // Validate location
  // Validate subcounty (optional: check if it exists for the location)
  // Create ticket with location and subcounty
}
```

#### Step 2.2: Add Location Validation Utility
```typescript
// lib/location-utils.ts
export const VALID_LOCATIONS = ["Kakamega", "Vihiga", "Nyamira", "Kisumu"] as const
export type Location = typeof VALID_LOCATIONS[number]

export function isValidLocation(location: string): location is Location {
  return VALID_LOCATIONS.includes(location as Location)
}

export function validateLocation(location: string | null | undefined): Location {
  if (!location) {
    throw new Error("Location is required")
  }
  if (!isValidLocation(location)) {
    throw new Error(`Invalid location: ${location}. Must be one of: ${VALID_LOCATIONS.join(", ")}`)
  }
  return location
}
```

---

### Phase 3: UI Enforcement

#### Step 3.1: Update Ticket Creation Form
- [ ] Make location selector required (not optional)
- [ ] **Add subcounty selector (REQUIRED)** - populate based on selected location
- [ ] Default to "Nyamira" for existing users
- [ ] Show clear location and subcounty badges on ticket cards
- [ ] Add location and subcounty filters prominently
- [ ] Update form validation to require both location and subcounty

#### Step 3.2: Update Nyamira Dashboard
- [ ] Refactor to accept location parameter
- [ ] Remove hardcoded "Nyamira" strings
- [ ] Make all data fetching location-aware
- [ ] Add location selector when converting to multi-county

#### Step 3.3: Add Location Indicators
- [ ] Show location badge on all tickets
- [ ] Add location filter to ticket list
- [ ] Display location in ticket details
- [ ] Add location to unresolved tickets view

---

## Data Isolation Rules

### Rule 1: Location is Always Required
- ✅ Facilities: Already enforced (API requires location)
- ⚠️ Tickets: Must be enforced (make required, add validation)

### Rule 2: All Queries Filter by Location
- ✅ Facilities API: Already filters by location
- ⚠️ Tickets API: Must always filter by location (no "all locations" without explicit request)
- ✅ Comparisons API: Already filters by location

### Rule 3: No Cross-County Data Mixing
- ✅ Facilities: Already isolated (location in WHERE clause)
- ⚠️ Tickets: Need to ensure location filter is always applied
- ⚠️ Dashboard: Need to ensure location is always specified

### Rule 4: Clear Data Ownership
- All existing data is Nyamira
- When adding other counties, ensure clear separation
- Add data migration scripts for any existing null locations

---

## Migration Plan

### Pre-Migration Checklist
- [ ] Backup database
- [ ] Document current ticket count per location
- [ ] Verify all facilities have location set
- [ ] Identify any tickets with null location

### Migration Steps
1. **Backup Database**
   ```bash
   mysqldump -u root -p facility_dashboard > backup_before_location_migration.sql
   ```

2. **Update Existing Tickets - Location**
   ```sql
   -- Set all null locations to Nyamira
   UPDATE tickets SET location = 'Nyamira' WHERE location IS NULL;
   ```

3. **Update Existing Tickets - Subcounty**
   ```sql
   -- Match tickets to facilities and copy subcounty
   UPDATE tickets t
   INNER JOIN facilities f ON t.facilityName = f.name AND t.location = f.location
   SET t.subcounty = f.subcounty
   WHERE t.subcounty IS NULL AND f.subcounty IS NOT NULL;
   
   -- Set remaining null subcounties to "Unknown" (will need manual review)
   UPDATE tickets SET subcounty = 'Unknown' WHERE subcounty IS NULL;
   ```

3. **Update Schema**
   ```bash
   # Update Prisma schema (make location required)
   npx prisma migrate dev --name make_ticket_location_required
   ```

4. **Verify Migration**
   ```sql
   -- Check all tickets have location
   SELECT COUNT(*) FROM tickets WHERE location IS NULL; -- Should be 0
   
   -- Check all tickets have subcounty
   SELECT COUNT(*) FROM tickets WHERE subcounty IS NULL; -- Should be 0
   
   -- Check location distribution
   SELECT location, COUNT(*) FROM tickets GROUP BY location;
   
   -- Check subcounty distribution
   SELECT location, subcounty, COUNT(*) FROM tickets GROUP BY location, subcounty;
   
   -- Check tickets with "Unknown" subcounty (may need manual review)
   SELECT COUNT(*) FROM tickets WHERE subcounty = 'Unknown';
   ```

5. **Update Code**
   - Update API endpoints to require location and subcounty
   - Update UI components to always specify location and subcounty
   - Add validation utilities for location and subcounty
   - Update analytics to use subcounty for categorization

### Post-Migration Validation
- [ ] All tickets have location set
- [ ] All tickets have subcounty set (from facility matching or "Unknown")
- [ ] API endpoints require location and subcounty
- [ ] UI components default to location and require subcounty
- [ ] No cross-county data mixing possible
- [ ] Existing Nyamira data remains intact
- [ ] Categorization by subcounty works in analytics
- [ ] Review tickets with "Unknown" subcounty for manual correction

---

## Implementation Priority

### Critical (Do Before Adding Other Counties)
1. ✅ **Make ticket location required** (database schema)
2. ✅ **Migrate existing tickets** (set null → Nyamira)
3. ✅ **Update API to require location** (enforce in endpoints)
4. ✅ **Add location validation** (prevent invalid locations)

### High Priority (Before Multi-County Dashboard)
5. ✅ **Update Nyamira Dashboard** (make location-aware)
6. ✅ **Add location indicators** (show location in UI)
7. ✅ **Enforce location in UI** (required fields, filters)

### Medium Priority (During Multi-County Expansion)
8. ✅ **Add location filtering** (all views filter by location)
9. ✅ **Add location badges** (visual indicators)
10. ✅ **Test cross-county isolation** (ensure no mixing)

---

## Testing Strategy

### Test 1: Location & Subcounty Isolation
- [ ] Create ticket for Nyamira with subcounty
- [ ] Create ticket for Kakamega with subcounty
- [ ] Verify tickets are separated by location
- [ ] Verify tickets have subcounty set
- [ ] Verify queries return only correct location data
- [ ] Verify categorization works by subcounty

### Test 2: API Enforcement
- [ ] Try to create ticket without location → Should fail
- [ ] Try to create ticket without subcounty → Should fail
- [ ] Try to query tickets without location → Should fail or require parameter
- [ ] Try invalid location → Should fail validation
- [ ] Try invalid subcounty → Should fail validation

### Test 3: Data Migration
- [ ] Verify all existing tickets have location = "Nyamira"
- [ ] Verify no tickets have location = null
- [ ] Verify all existing tickets have subcounty set (from facility matching or "Unknown")
- [ ] Verify no tickets have subcounty = null
- [ ] Verify facility queries still work correctly
- [ ] Verify ticket-to-facility matching for subcounty worked correctly

### Test 4: UI Behavior
- [ ] Location selector is required
- [ ] Subcounty selector is required and populates based on location
- [ ] Default location is "Nyamira" (for backward compatibility)
- [ ] Location and subcounty filters work correctly
- [ ] Location and subcounty badges display correctly
- [ ] Categorization by subcounty works in analytics

---

## Code Changes Required

### Database Schema
```prisma
model Ticket {
  // Change from:
  location        String?   @db.VarChar(50)
  
  // To:
  location        String    @db.VarChar(50) // REQUIRED
  subcounty       String    @db.VarChar(100) // REQUIRED - for categorization
  
  @@index([location])
  @@index([location, status])
  @@index([location, subcounty]) // For efficient filtering
  @@index([subcounty]) // For categorization queries
}
```

### API Routes
- `app/api/tickets/route.ts`: Require location parameter
- Add location validation utility
- Update error messages

### Components
- `components/tickets.tsx`: Make location required, add validation
- `components/nyamira-dashboard.tsx`: Make location-aware (remove hardcoded "Nyamira")
- Add location indicators throughout

### Utilities
- Create `lib/location-utils.ts` for location validation
- Add location constants

---

## Success Criteria

- ✅ All tickets have location set (no null values)
- ✅ All tickets have subcounty set (no null values)
- ✅ API endpoints require location and subcounty parameters
- ✅ UI components enforce location and subcounty selection
- ✅ No cross-county data mixing possible
- ✅ Existing Nyamira data remains intact
- ✅ New counties can be added without affecting Nyamira data
- ✅ Location and subcounty filtering works correctly in all views
- ✅ Categorization by subcounty works in analytics and dashboards

---

## Notes

### Current State
- **All existing data is Nyamira**
- Facilities are already location-separated ✅
- Tickets need location enforcement ⚠️
- Nyamira Dashboard is hardcoded ⚠️

### Future State
- All data is location-isolated
- Multi-county dashboard works with location switching
- No risk of data mixing between counties
- Clear data ownership per county

---

**Critical Action**: Before adding other counties, ensure ticket location is required and all existing tickets are migrated to have location = "Nyamira".
