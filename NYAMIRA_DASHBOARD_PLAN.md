# Nyamira Dashboard - Comprehensive Implementation Plan

## Overview
Create a perfect, comprehensive dashboard for Nyamira location that handles facility matching, CBS/NDWH uploads, comparison tracking, and ticket analytics.

---

## Phase 1: Enhanced Facility Matching System

### 1.1 Multi-Sheet Facility Matching
**Objective**: Match facilities across 4 sheets regardless of name variations

**Requirements**:
- **Sheet 1**: Master Facilities List (Nyamira)
- **Sheet 2**: Facilities by Server Type Group A
- **Sheet 3**: Facilities by Server Type Group B  
- **Sheet 4**: Facilities by Server Type Group C

**Matching Logic**:
- Enhanced fuzzy matching to handle variations:
  - "Kenyerere Dispensary" = "Kenyerere Health Center" = "Kenyerere"
  - Remove facility type suffixes (Dispensary, Health Centre, Hospital, etc.)
  - Case-insensitive matching
  - Partial name matching
  - Core name extraction (remove location prefixes/suffixes)

**Validation**:
- Total facilities across all 4 sheets must equal master facilities total
- Cross-reference facilities between sheets
- Identify duplicates and variations
- Flag facilities that appear in multiple sheets with different names

**Implementation**:
- Enhance `facilitiesMatch()` function in `lib/utils.ts`
- Add facility type normalization
- Create facility grouping by server type
- Add validation checks

---

## Phase 2: Nyamira Database Setup & Dashboard

### 2.1 Database Schema Enhancements
**New Fields Needed**:
- `serverType`: Type of server at facility (Group A, B, C, etc.)
- `facilityGroup`: Which sheet/group the facility belongs to
- `matchedVariations`: Array of matched facility name variations

### 2.2 Nyamira-Specific Dashboard
**Features**:
- **Overview Cards**:
  - Total Master Facilities
  - Facilities by Server Type (Group A, B, C)
  - CBS Upload Status
  - NDWH Upload Status
  - Total Uploaded vs Not Uploaded

- **Facility Management**:
  - View all Nyamira facilities
  - Filter by server type
  - See matched variations
  - Edit facility details
  - Add new facilities

- **Visualizations**:
  - Pie chart: Facilities by Server Type
  - Bar chart: Upload Status (CBS vs NDWH)
  - Comparison charts: Master vs Reported by system

---

## Phase 3: CBS/NDWH Upload Testing & Comparison Tracking

### 3.1 Upload Comparison System
**Features**:
- **Upload Interface**:
  - Separate upload sections for CBS and NDWH
  - Paste/upload facility lists
  - Real-time matching against master list

- **Comparison Engine**:
  - Match uploaded facilities with master list
  - Identify facilities that haven't uploaded to CBS
  - Identify facilities that haven't uploaded to NDWH
  - Identify facilities that haven't uploaded to either
  - Show matched vs unmatched facilities

- **Comparison History**:
  - Store each comparison query with timestamp
  - Track changes over time
  - Show comparison trends
  - Export comparison reports

### 3.2 Database Schema for Comparisons
**New Model**: `ComparisonHistory`
- `id`: Unique identifier
- `system`: CBS or NDWH
- `location`: Nyamira
- `uploadedFacilities`: Array of facility names
- `matchedCount`: Number of matched facilities
- `unmatchedCount`: Number of unmatched facilities
- `matchedFacilities`: Array of matched facility names
- `unmatchedFacilities`: Array of unmatched facility names
- `timestamp`: When comparison was made
- `userId`: Who made the comparison (optional)

### 3.3 Comparison Dashboard
**Views**:
- **Current Status**:
  - Latest comparison results
  - Facilities not uploaded to CBS
  - Facilities not uploaded to NDWH
  - Facilities not uploaded to either

- **History Timeline**:
  - List of all previous comparisons
  - Trend charts showing upload progress over time
  - Comparison between different time periods

---

## Phase 4: Nyamira Ticket System with Analytics

### 4.1 Ticket Import System
**Features**:
- **Import from Ticket Sheet**:
  - Upload/import tickets from spreadsheet
  - Map columns: Facility Name, Server Type, Issue, Solution, Week
  - Date Generation:
    - Pick random dates from specified week
    - Exclude weekends (Saturday & Sunday)
    - Only use Monday-Friday dates
    - Distribute dates evenly across the week

- **Ticket Validation**:
  - Match ticket facilities with master facility list
  - Link tickets to server types
  - Validate facility names against database

### 4.2 Advanced Ticket Analytics
**Graphs & Visualizations**:

1. **Server Capability vs Issues**:
   - Bar chart: Issues per server type
   - Compare server groups (A, B, C) issue frequency
   - Identify problematic server types

2. **Facility Issue Patterns**:
   - Heatmap: Facilities with most tickets
   - Trend analysis: Which facilities have recurring issues
   - Issue frequency by facility

3. **Ticket Resolution Analysis**:
   - Resolution time by server type
   - Resolution rate by facility
   - Common issues by server type

4. **Comparative Analytics**:
   - Compare ticket patterns across server types
   - Identify correlations between server type and issues
   - Predict potential problem areas

5. **Time-Based Analysis**:
   - Tickets over time (by week/month)
   - Peak issue periods
   - Resolution trends

### 4.3 Ticket Dashboard Features
- **Summary Cards**:
  - Total tickets for Nyamira
  - Tickets by server type
  - Open vs Resolved
  - Average resolution time

- **Interactive Charts**:
  - Server type comparison
  - Facility issue frequency
  - Issue category breakdown
  - Resolution trends

---

## Phase 5: Implementation Order

### Step 1: Enhanced Facility Matching ✅
- [ ] Improve matching algorithm
- [ ] Add facility type normalization
- [ ] Test with Nyamira data

### Step 2: Database Setup ✅
- [ ] Add serverType field to Facility model
- [ ] Create ComparisonHistory model
- [ ] Update Prisma schema
- [ ] Run migrations

### Step 3: Import Nyamira Facilities ✅
- [ ] Create import script for 4 sheets
- [ ] Match facilities across sheets
- [ ] Validate totals
- [ ] Populate database

### Step 4: Nyamira Dashboard ✅
- [ ] Create Nyamira-specific dashboard page
- [ ] Add overview cards
- [ ] Add facility management
- [ ] Add visualizations

### Step 5: Upload Comparison System ✅
- [ ] Create upload interface
- [ ] Build comparison engine
- [ ] Add comparison history tracking
- [ ] Create comparison dashboard

### Step 6: Ticket Import & Analytics ✅
- [ ] Create ticket import functionality
- [ ] Add date generation (weekdays only)
- [ ] Build advanced analytics
- [ ] Create ticket dashboard with graphs

---

## Technical Requirements

### Database Changes
```prisma
model Facility {
  // ... existing fields
  serverType String?  // Group A, B, C, etc.
  facilityGroup String? // Which sheet/group
}

model ComparisonHistory {
  id String @id @default(cuid())
  system String // CBS or NDWH
  location String
  uploadedFacilities Json // Array of facility names
  matchedCount Int
  unmatchedCount Int
  matchedFacilities Json
  unmatchedFacilities Json
  timestamp DateTime @default(now())
  createdAt DateTime @default(now())
}
```

### New Components Needed
1. `nyamira-dashboard.tsx` - Main Nyamira dashboard
2. `facility-upload-comparison.tsx` - Upload and comparison interface
3. `comparison-history.tsx` - History viewer
4. `ticket-importer.tsx` - Ticket import with date generation
5. `ticket-analytics.tsx` - Advanced ticket analytics dashboard

### New API Routes
1. `/api/facilities/import` - Import facilities from sheets
2. `/api/comparisons` - Handle comparison operations
3. `/api/comparisons/history` - Get comparison history
4. `/api/tickets/import` - Import tickets from sheet
5. `/api/tickets/analytics` - Get ticket analytics data

---

## Success Criteria

✅ Facilities match correctly across all 4 sheets regardless of name variations
✅ Total facilities match master list total
✅ CBS/NDWH uploads compare accurately with existing facilities
✅ Comparison history is tracked with timestamps
✅ Tickets import with proper weekday date generation
✅ Advanced analytics show server capability vs issues
✅ Comparative analysis across server types and facilities
✅ Clean, intuitive dashboard for Nyamira

---

## Next Steps

1. Review and approve this plan
2. Start with Phase 1: Enhanced Facility Matching
3. Proceed through each phase systematically
4. Test each component before moving to next phase
