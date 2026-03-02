# System Architecture Analysis & Requirements Comparison
## Comprehensive System Assessment Document

**Document Version:** 1.0  
**Date:** 2024  
**Status:** Analysis Complete - Awaiting Review

---

## Executive Summary

This document provides a comprehensive analysis of the existing system architecture, documents what currently exists, compares it against the original requirements, and proposes necessary adjustments to align the implementation plan with the actual system design.

### Key Finding
The system has **three distinct but interconnected subsystems**:
1. **EMR Facility Data Management** - Captures and manages facility information, equipment, and infrastructure
2. **NDWH/CBS Upload Monitoring** - Tracks which facilities have uploaded data to NDWH and CBS systems
3. **EMR Ticketing System** - Manages support tickets for EMR facility issues

---

## System Architecture Overview

### Core Infrastructure ✅

#### 1. Database Layer (MySQL + Prisma)
- **Facility Model**: Stores facility data with metadata
  - Fields: name, subcounty, sublocation, serverType, simcardCount, hasLAN, facilityGroup
  - System field: "NDWH" or "CBS" (used for upload monitoring context)
  - isMaster flag: distinguishes master facility lists from uploaded/reported lists
  - Location: Kakamega, Vihiga, Nyamira, Kisumu

- **Ticket Model**: EMR support tickets
  - Fields: facilityName, serverCondition, problem, solution, status, location, issueType, serverType
  - Status tracking: open, in-progress, resolved
  - Issue categorization: server vs network

- **ComparisonHistory Model**: Tracks upload comparisons
  - Stores CBS/NDWH upload comparisons against master lists
  - Tracks matched/unmatched facilities per upload
  - Week-based tracking for upload history

#### 2. API Layer
- `/api/facilities` - CRUD operations for facilities
- `/api/tickets` - Ticket management
- `/api/comparisons` - Upload comparison tracking
- `/api/facilities/import` - Facility import functionality

#### 3. Frontend Components
- Dashboard (`/`) - Main overview showing upload status across locations
- Facility Manager (`/facility-manager`) - EMR facility data management
- Uploads (`/uploads`) - NDWH/CBS upload monitoring interface
- Tickets (`/tickets`) - EMR ticketing system
- Reports (`/reports`) - Reporting functionality
- Nyamira Dashboard (`/nyamira`) - County-specific analytics dashboard

---

## What Currently Exists

### ✅ EMR Facility Data Management System

#### Purpose
Captures and manages comprehensive facility information including:
- Facility names, subcounties, sublocations
- Server types (Group A, B, C, etc.)
- Infrastructure: simcard counts, LAN availability
- Facility grouping and categorization

#### Components
1. **Facility Manager** (`/facility-manager`)
   - Master facility list management per location
   - Bulk facility import (text-based)
   - Individual facility CRUD operations
   - Detailed facility form with all metadata fields
   - Excel export functionality
   - System selector (NDWH/CBS) - **Note**: This appears to be for organizational purposes, not separate facility lists

2. **Database Storage**
   - Facilities stored with system field (NDWH/CBS)
   - Master facilities (`isMaster=true`) represent the authoritative facility list
   - Reported facilities (`isMaster=false`) represent uploaded/reported lists

#### Current Capabilities
- ✅ Add facilities individually with full metadata
- ✅ Bulk import facilities from text
- ✅ Edit facility details (name, subcounty, sublocation, serverType, simcardCount, hasLAN, facilityGroup)
- ✅ Delete facilities
- ✅ Export facilities to Excel
- ✅ Filter by system (NDWH/CBS) and location

#### Limitations
- ❌ No Excel import (only text-based import)
- ❌ No asset tag/serial number tracking
- ❌ No custom asset type management
- ❌ System field usage unclear (appears to be organizational, not functional separation)

---

### ✅ NDWH/CBS Upload Monitoring System

#### Purpose
Monitors which facilities have uploaded data to NDWH and CBS systems by:
- Comparing uploaded facility lists against master facility lists
- Tracking upload history with week-based timestamps
- Identifying facilities that haven't uploaded to each system

#### Components
1. **Uploads Page** (`/uploads`)
   - Separate upload interfaces for CBS and NDWH
   - Paste facility lists from upload reports
   - Week date selection for upload tracking
   - Location selection
   - Upload history viewing
   - Comparison statistics (matched/unmatched counts)

2. **Comparison Engine** (`/api/comparisons`)
   - Fuzzy matching algorithm for facility name variations
   - Stores comparison results in ComparisonHistory table
   - Tracks week-based upload patterns

3. **Dashboard Integration**
   - Main dashboard shows upload status per location
   - Comparison between master facilities and uploaded facilities
   - Progress tracking and visualization

#### Current Capabilities
- ✅ Upload facility lists for CBS and NDWH separately
- ✅ Compare uploaded lists against master facility list
- ✅ Track upload history with timestamps
- ✅ Week-based upload tracking
- ✅ Identify matched and unmatched facilities
- ✅ View upload trends over time

#### How It Works
1. Master facilities are stored (typically using NDWH system as standard)
2. When facilities upload to CBS or NDWH, their facility lists are pasted into the system
3. System compares uploaded list against master list
4. Results show:
   - Matched facilities (successfully uploaded)
   - Unmatched facilities (in uploaded list but not in master)
   - Missing facilities (in master but not uploaded)

#### Limitations
- ⚠️ System field confusion: Both NDWH and CBS use the same master facility list (NDWH master), but the system field in Facility model suggests separation
- ❌ No automatic upload detection (manual paste required)
- ❌ No integration with actual NDWH/CBS systems

---

### ✅ EMR Ticketing System

#### Purpose
Manages support tickets for EMR facility issues, tracking:
- Facility problems and resolutions
- Server conditions and issue types
- Ticket assignment and status
- Analytics and correlation

#### Components
1. **Tickets Page** (`/tickets`)
   - Create, edit, delete tickets
   - Filter by status, location, issue type
   - Search functionality
   - Basic analytics charts

2. **Nyamira Dashboard** (`/nyamira`)
   - Comprehensive analytics dashboard
   - Server distribution analysis
   - Simcard & LAN distribution
   - Ticket correlation analytics
   - Issue rate analysis
   - Most problematic categories identification

#### Current Capabilities
- ✅ Create tickets with facility name, problem, server condition
- ✅ Automatic issue type detection (server vs network)
- ✅ Status management (open, in-progress, resolved)
- ✅ Weekday date generation for ticket timestamps
- ✅ Filtering and search
- ✅ Basic analytics and charts
- ✅ Advanced correlation analytics (Nyamira dashboard)

#### Limitations
- ❌ No ticket assignment to users
- ❌ No support personnel tracking
- ❌ No backdating support (only weekday dates)
- ❌ No troubleshooting issue category
- ❌ No user authentication (anyone can create/edit tickets)

---

## Original Requirements vs Current State

### Original Requirements (from progress and updates.md)

#### FR1: Ticket Management System
**Original Requirements:**
- Who the task is assigned to ✅ **Missing**
- Facility and subcounty ✅ **Partial** (facility yes, subcounty in facility data but not in ticket)
- Who supported the task assigned to/ticket ✅ **Missing**
- Dates of issue being reported and resolution ✅ **Partial** (has createdAt/resolvedAt, but no backdating)
- Capturing other issues like troubleshooting ✅ **Missing**

**Current State:**
- ✅ Basic ticket creation and management
- ✅ Status tracking
- ✅ Issue type categorization
- ❌ No assignment system
- ❌ No support personnel tracking
- ❌ No backdating
- ❌ No troubleshooting category

#### FR2: Authentication & Authorization
**Original Requirements:**
- JWT setup for authorization ✅ **Missing**
- Permissions entry system ✅ **Missing**
- Admin rights (full access) ✅ **Missing**
- Viewer rights (create tickets only) ✅ **Missing**

**Current State:**
- ❌ No authentication system
- ❌ No authorization/role-based access
- ❌ All features accessible to anyone

#### FR3: Excel Equipment Import
**Original Requirements:**
- Importing Excel sheet of equipment ✅ **Missing**
- Access Nyamira Facilities.ods file format ✅ **Missing**
- Asset tags and serial numbers ✅ **Missing**
- Option for admin to create additional asset types ✅ **Missing**
- Download template functionality ✅ **Missing**

**Current State:**
- ✅ Text-based facility import
- ✅ Excel export functionality
- ❌ No Excel import
- ❌ No asset tag/serial number fields
- ❌ No custom asset type management

#### FR4: Multi-County Dashboards
**Original Requirements:**
- County dashboards for Kakamega, Vihiga, Kisumu ✅ **Partial** (Nyamira exists)
- Separate CBS dashboard for all counties ✅ **Missing**

**Current State:**
- ✅ Nyamira dashboard (comprehensive)
- ❌ Kakamega dashboard (missing)
- ❌ Vihiga dashboard (missing)
- ❌ Kisumu dashboard (missing)
- ❌ CBS dashboard (missing)

#### FR5: EMR Site Data Capture
**Original Requirements:**
- Capture EMR site data including facility names and equipment ✅ **Partial**
- Equipment details ✅ **Partial** (has serverType, simcardCount, hasLAN, but missing asset tags, serial numbers)

**Current State:**
- ✅ Facility name capture
- ✅ Server type tracking
- ✅ Infrastructure tracking (simcards, LAN)
- ❌ Equipment asset tracking (tags, serial numbers)
- ❌ Equipment type management

---

## System Architecture Clarification

### Critical Understanding

#### EMR System (Facility Data Management)
- **Purpose**: Source system for capturing facility information
- **Components**: Facility Manager, Facility database
- **Data Captured**: Facility names, locations, server types, infrastructure (simcards, LAN)
- **Status**: ✅ Functional but incomplete (missing Excel import, asset tracking)

#### NDWH/CBS Upload Monitoring
- **Purpose**: Monitor which facilities have uploaded data to NDWH and CBS systems
- **Components**: Uploads page, Comparison engine, ComparisonHistory
- **How It Works**:
  1. Master facility list is maintained (EMR system)
  2. When facilities upload to NDWH/CBS, their facility lists are reported
  3. System compares uploaded lists against master list
  4. Tracks upload compliance and identifies missing facilities
- **Status**: ✅ Functional

#### EMR Ticketing System
- **Purpose**: Track support tickets for EMR facility issues
- **Components**: Tickets page, Nyamira dashboard analytics
- **Status**: ✅ Functional but incomplete (missing assignment, authentication)

### Key Insight: System Field Confusion

The `system` field in the Facility model (NDWH/CBS) appears to be used for:
1. **Organizational separation** - Facilities can be tagged as NDWH or CBS related
2. **Master list context** - The comparison system uses NDWH master facilities as the standard

However, this creates confusion because:
- Both NDWH and CBS uploads are compared against the same master list (NDWH master)
- The system field doesn't represent separate facility inventories
- It's unclear if facilities should have separate NDWH and CBS entries

**Recommendation**: Clarify the purpose of the `system` field or consider removing it if not functionally necessary.

---

## Proposed Adjustments to Implementation Plan

### Priority 1: Clarify and Document System Architecture

#### Action Items
1. **Document the three-system architecture clearly**
   - EMR Facility Management (source system)
   - NDWH/CBS Upload Monitoring (compliance tracking)
   - EMR Ticketing (support system)

2. **Resolve system field confusion**
   - Determine if NDWH/CBS separation is needed at facility level
   - If not needed, consider removing or repurposing the field
   - If needed, clarify the use case

3. **Update documentation**
   - Clearly separate EMR facility management from upload monitoring
   - Document the flow: EMR → Master List → Upload Comparison

### Priority 2: Complete EMR Facility Management

#### Missing Features
1. **Excel Import System**
   - Analyze Nyamira Facilities.ods format
   - Create Excel parser
   - Support asset tags and serial numbers
   - Template generation

2. **Asset Management**
   - Add assetTag and serialNumber fields
   - Custom asset type management
   - Equipment inventory tracking

### Priority 3: Enhance EMR Ticketing

#### Missing Features
1. **Authentication & Authorization** (Critical)
   - JWT authentication
   - Role-based access (Admin/Viewer)
   - Ticket assignment to users
   - Support personnel tracking

2. **Ticket Enhancements**
   - Backdating support
   - Troubleshooting issue category
   - Assignment workflow

### Priority 4: Expand Dashboards

#### Missing Dashboards
1. **County Dashboards**
   - Kakamega dashboard (reuse Nyamira components)
   - Vihiga dashboard
   - Kisumu dashboard

2. **CBS Dashboard**
   - Separate dashboard for CBS system
   - Multi-county CBS view
   - CBS-specific analytics

---

## Revised Implementation Phases

### Phase 1: System Architecture Clarification & Documentation
**Timeline:** 1 week  
**Priority:** Critical

**Tasks:**
- [ ] Document clear separation of EMR, NDWH/CBS monitoring, and Ticketing systems
- [ ] Resolve system field usage confusion
- [ ] Update all documentation to reflect correct architecture
- [ ] Create system flow diagrams

### Phase 2: EMR Facility Management Completion
**Timeline:** 3-4 weeks  
**Priority:** High

**Tasks:**
- [ ] Excel import system (analyze .ods format)
- [ ] Asset tag and serial number tracking
- [ ] Custom asset type management
- [ ] Template generation and download

### Phase 3: Authentication & Authorization
**Timeline:** 2-3 weeks  
**Priority:** High

**Tasks:**
- [ ] JWT authentication system
- [ ] Role-based access control (Admin/Viewer)
- [ ] User management interface
- [ ] Protect all routes and API endpoints

### Phase 4: EMR Ticketing Enhancements
**Timeline:** 2-3 weeks  
**Priority:** Medium

**Tasks:**
- [ ] Ticket assignment system
- [ ] Support personnel tracking
- [ ] Backdating support
- [ ] Troubleshooting issue category

### Phase 5: Dashboard Expansion
**Timeline:** 3-4 weeks  
**Priority:** Medium

**Tasks:**
- [ ] Extract reusable dashboard components
- [ ] Create Kakamega dashboard
- [ ] Create Vihiga dashboard
- [ ] Create Kisumu dashboard
- [ ] Create CBS dashboard (all counties)

---

## Recommendations

### Immediate Actions
1. **Clarify System Purpose**: Update documentation to clearly explain:
   - EMR = Facility data source system
   - NDWH/CBS = Upload monitoring (compliance tracking)
   - Tickets = Support system

2. **Resolve System Field**: Determine if NDWH/CBS separation at facility level is needed

3. **Prioritize Authentication**: This is critical for production use

### Long-term Considerations
1. **Integration**: Consider future integration with actual NDWH/CBS systems for automatic upload detection
2. **Scalability**: Plan for additional counties beyond the current four
3. **Reporting**: Enhance reporting capabilities for compliance tracking

---

## Conclusion

The system has a solid foundation with three interconnected subsystems. The main gaps are:
1. **Authentication & Authorization** (critical for production)
2. **Excel Import** (required for efficient data entry)
3. **Dashboard Expansion** (needed for all counties)
4. **Ticket Enhancements** (assignment, backdating, troubleshooting)

The architecture is sound but needs clarification in documentation. The implementation plan should be adjusted to reflect the actual three-system architecture rather than treating NDWH/CBS as separate facility management systems.

---

**Next Steps:**
1. Review this analysis with stakeholders
2. Confirm system architecture understanding
3. Resolve system field usage question
4. Update implementation plan accordingly
5. Begin Phase 1 (Architecture Clarification)
