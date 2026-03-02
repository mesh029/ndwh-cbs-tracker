# EMR Ticketing & Facility Management System
## System Design Document & Implementation Roadmap

**Document Version:** 1.0  
**Last Updated:** 2024  
**Status:** Active Development  
**System Engineer:** Development Team

---

## Executive Summary

This document outlines the comprehensive system design and phased implementation plan for an Enterprise-level EMR (Electronic Medical Records) Ticketing and Facility Management System. 

### System Architecture (Three Separate Subsystems)

#### 1. EMR Facility Management & Ticketing System
**Purpose**: Manages EMR facility data, network infrastructure, equipment, and inventory
- **Components**:
  - Facility Manager (`/facility-manager`) - Facility data capture and management
  - County Dashboards (`/nyamira`, future multi-county) - Analytics and visualization
  - Tickets (`/tickets`) - Support ticket management
  - Reports (`/reports`) - Report generation and download
- **Data Managed**:
  - Facility information (names, subcounties, sublocations)
  - Network infrastructure (simcards, LAN)
  - Equipment inventory (server types, asset tags, serial numbers)
  - Support tickets and issue tracking
- **Status**: ✅ Functional, needs Excel import and report enhancements

#### 2. NDWH/CBS Upload Monitoring System (SEPARATE)
**Purpose**: Monitors upload compliance to NDWH and CBS systems
- **Components**:
  - Uploads Page (`/uploads`) - Upload facility lists and track compliance
  - Comparison Engine - Compares uploaded lists against master lists
  - Upload History - Tracks upload trends over time
- **Data Managed**:
  - Uploaded facility lists (from NDWH/CBS systems)
  - Comparison results (matched/unmatched facilities)
  - Upload compliance tracking
- **Status**: ✅ Functional, separate from EMR system
- **Note**: This system is INDEPENDENT and should not be mixed with EMR facility management

#### 3. Reports System
**Purpose**: Generate and download reports across all systems
- **Components**:
  - Reports Page (`/reports`) - Report generation interface
  - Export functionality - Download reports in various formats
- **Report Types**:
  - EMR Facility Reports (facility lists, equipment inventory, infrastructure)
  - NDWH/CBS Upload Compliance Reports
  - Ticket Analytics Reports
  - County Comparison Reports
- **Status**: ⚠️ Partially functional, needs enhancement

### System Objectives

#### EMR Facility Management & Ticketing System
- Centralized EMR facility data capture and management
- Network infrastructure tracking (simcards, LAN)
- Equipment inventory management (server types, asset tags, serial numbers)
- EMR support ticket management with analytics
- Multi-county facility inventory tracking with Excel import capabilities
- Advanced analytics and correlation dashboards per county
- Comprehensive reporting and export capabilities

#### NDWH/CBS Upload Monitoring System (Separate)
- Upload compliance monitoring for NDWH and CBS systems
- Comparison of uploaded facility lists against master lists
- Upload history tracking and trend analysis
- Compliance reporting

#### Reports System
- Generate downloadable reports for all systems
- Export in multiple formats (Excel, PDF, CSV)
- Custom report generation
- Scheduled report generation (future)

#### Security & Access
- Role-based access control (RBAC) with JWT authentication
- Separate access controls for EMR vs NDWH/CBS systems

---

## Current System State

### ✅ Completed Features

#### Phase 1: Core Infrastructure
- [x] MySQL database migration from localStorage
- [x] Prisma ORM integration
- [x] RESTful API endpoints (`/api/facilities`, `/api/tickets`, `/api/comparisons`)
- [x] Multi-location support (Kakamega, Vihiga, Nyamira, Kisumu)
- [x] Three-system architecture (EMR Facility Management, NDWH/CBS Upload Monitoring, EMR Ticketing)

#### Phase 2: EMR Facility Data Management
- [x] Master facility list management (`/facility-manager`)
- [x] Facility matching with fuzzy logic
- [x] Bulk facility import (text-based)
- [x] Facility details: subcounty, sublocation, serverType, simcardCount, hasLAN, facilityGroup
- [x] Facility export to Excel format
- [x] Individual facility CRUD operations
- [x] Detailed facility form with all metadata fields

#### Phase 2b: NDWH/CBS Upload Monitoring
- [x] Upload interface for CBS and NDWH (`/uploads`)
- [x] Facility list comparison engine
- [x] Upload history tracking with week-based timestamps
- [x] Matched/unmatched facility identification
- [x] Comparison statistics and trends
- [x] Integration with main dashboard for upload status

#### Phase 3: EMR Ticketing System
- [x] Ticket creation and management (`/tickets`)
- [x] Automatic issue type detection (server vs network)
- [x] Status tracking (open, in-progress, resolved)
- [x] Weekday date generation for ticket timestamps
- [x] Ticket filtering and search
- [x] Basic analytics and charts

#### Phase 3b: Nyamira Dashboard (Pilot - Complete ✅)
- [x] Comprehensive Nyamira dashboard with analytics (`/app/nyamira/page.tsx`)
- [x] Server distribution visualization
- [x] Simcard & LAN distribution tracking
- [x] Ticket analytics with correlation charts
- [x] Issue type categorization (server vs network)
- [x] Hover tooltips for detailed insights
- [x] Most problematic server type identification
- [x] Upload comparison tracking (CBS/NDWH)
- [x] Sublocation distribution analysis

#### Phase 4: Main Dashboard
- [x] Multi-location overview dashboard (`/`)
- [x] Upload status tracking per location
- [x] Facility comparison visualization
- [x] Progress tracking and charts
- [x] Search and filtering capabilities

### 🔄 In Progress
- None currently

### 📋 Ready for Implementation
- Excel import system for EMR facility data
- Authentication & Authorization system
- County-specific dashboards: Kakamega, Vihiga, Kisumu (Nyamira template exists ✅)
- CBS dashboard for all counties
- Ticket assignment and support personnel tracking

### ⏳ Pending Features

#### EMR Facility Management
- Excel equipment import (analyze Nyamira Facilities.ods format)
- Asset tag and serial number tracking
- Custom asset type management
- Template generation and download

#### Authentication & Authorization (Simplified)
- Simple authentication system (Admin/Guest only)
- No user database needed
- Credentials stored in environment variables
- Admin: Full access to view and edit everything
- Guest: Can only create tickets and add their name/required fields
- Protected routes and API endpoints

#### EMR Ticketing Enhancements
- Ticket assignment to users
- Support personnel tracking
- Backdating support for tickets
- Troubleshooting issue category

#### Dashboard Expansion
- Kakamega dashboard
- Vihiga dashboard
- Kisumu dashboard
- CBS dashboard (all counties view)

---

## Requirements Analysis

### Functional Requirements

#### FR1: Ticket Management System
**Priority:** High  
**Status:** Partially Complete

**Requirements:**
1. **Ticket Creation & Assignment**
   - Guest/Admin creates ticket with their name and location
   - Ticket appears in unresolved tickets list
   - Support personnel can claim/take tickets from unresolved list
   - Track who reported, who claimed, and who resolved

2. **Ticket Metadata**
   - Reporter name (`reportedBy`) - who created the ticket
   - Location - where the ticket is for
   - Facility name and subcounty association
   - Assigned to (`assignedTo`) - support personnel who claimed it
   - Resolved by (`supportedBy`) - who resolved it
   - Reported date with backdating capability (admin only)
   - Resolution date tracking

3. **Unresolved Tickets View**
   - List of all open/in-progress tickets
   - Grouped by location
   - Shows reporter name
   - Support personnel can claim tickets from this list

4. **Issue Categorization**
   - Server issues (existing)
   - Network issues (existing)
   - Troubleshooting issues (pending)
   - Other issue types (extensible)

#### FR2: Simple Authentication & Authorization
**Priority:** High  
**Status:** Not Started

**Simplified Requirements:**
1. **Simple Authentication (No User Database)**
   - Two login types: Admin and Guest
   - Credentials stored in environment variables
   - Session-based authentication (cookies/sessions)
   - No user management needed

2. **Role-Based Access Control**
   - **Admin Role**: Full system access
     - View and edit everything
     - Create/edit/delete facilities
     - Create/edit/delete tickets
     - Access all dashboards
     - Import/export data
     - Generate reports
     - Manage uploads
   
   - **Guest Role**: Limited access
     - Create tickets only
     - Add their name and required ticket fields
     - Cannot edit/delete tickets
     - Cannot access Facility Manager
     - Cannot access Uploads
     - Cannot access Reports
     - Cannot access County Dashboards (or view-only if needed)

3. **No Permission Management Needed**
   - Simple two-role system
   - No user database
   - No permission configuration
   - Credentials in .env file

#### FR3: Excel Equipment Import System
**Priority:** High  
**Status:** Not Started

**Requirements:**
1. **Template-Based Import**
   - Downloadable Excel template
   - Standardized field mapping
   - Validation rules enforcement

2. **Required Fields**
   - Facility name
   - Subcounty
   - Sublocation
   - Server type
   - Asset tag (optional but recommended)
   - Serial number (optional but recommended)
   - Simcard count
   - LAN availability

3. **Dynamic Asset Management**
   - Admin can create custom asset types (e.g., routers, specific device models)
   - Custom field selection during upload
   - Template customization per asset type
   - Required field configuration

4. **Import Process**
   - Excel file upload
   - Field mapping interface
   - Data validation
   - Duplicate detection
   - Bulk import with error reporting

#### FR4: Multi-County Dashboard System
**Priority:** Medium  
**Status:** Partially Complete (Nyamira only)

**Requirements:**
1. **County-Specific Dashboards**
   - Kakamega dashboard (pending)
   - Vihiga dashboard (pending)
   - Kisumu dashboard (pending)
   - Nyamira dashboard (✅ complete)

2. **Dashboard Features** (per county)
   - Facility distribution by server type
   - Simcard & LAN distribution
   - Ticket analytics and correlation
   - Issue rate analysis
   - Most problematic categories
   - Upload comparison tracking

3. **CBS-Specific Dashboard**
   - Separate dashboard for CBS system
   - All counties viewable
   - CBS-specific analytics
   - Upload tracking

#### FR5: Advanced Facility Management
**Priority:** Medium  
**Status:** Partially Complete

**Requirements:**
1. **Asset Tracking**
   - Asset tag management
   - Serial number tracking
   - Asset type categorization
   - Asset history tracking

2. **Facility Data Enhancement**
   - Additional metadata fields
   - Custom field support
   - Facility grouping
   - Facility relationships

---

## Phased Implementation Plan

### Phase 1: Simple Authentication System
**Timeline:** 1 week  
**Priority:** High  
**Dependencies:** None

#### Implementation Approach
**Simplified Strategy**: Two login types only - no user database needed
- **Admin Login**: Full access to view and edit everything
- **Guest Login**: Can only create tickets and add their name/required ticket fields

#### Implementation Steps

**Step 1.1: Simple Authentication Setup**
- [ ] Create environment variables for credentials:
  - `ADMIN_PASSWORD` - Admin password (stored in .env)
  - `GUEST_PASSWORD` - Guest password (stored in .env)
- [ ] No database schema needed - no User model required
- [ ] Use simple session-based authentication (Next.js sessions or cookies)

**Step 1.2: Authentication Infrastructure**
- [ ] Install session library (`next-auth` or simple cookie-based sessions)
- [ ] Create authentication utilities (`lib/auth.ts`)
  - Simple password comparison (no hashing needed if using env vars)
  - Session creation and verification
  - Role determination (admin vs guest)
- [ ] Create login API endpoint (`/api/auth/login`)
  - Accept username/password
  - Compare against env vars
  - Create session with role
- [ ] Create logout API endpoint (`/api/auth/logout`)
- [ ] Create session check endpoint (`/api/auth/me`)

**Step 1.3: Authorization Middleware**
- [ ] Create authentication middleware (`middleware.ts` or `lib/auth-middleware.ts`)
- [ ] Create role checking helpers:
  - `requireAuth()` - Check if user is logged in
  - `requireAdmin()` - Check if user is admin
  - `requireGuestOrAdmin()` - Check if user is guest or admin
- [ ] Implement route protection
- [ ] Protect API routes based on role

**Step 1.4: Login UI**
- [ ] Create simple login page (`/app/login/page.tsx`)
  - Username/password form
  - Two login options: "Login as Admin" or "Login as Guest"
  - Or single form that detects role based on credentials
- [ ] Add logout button in sidebar/header
- [ ] Show current user role in UI (Admin/Guest)

**Step 1.5: Access Control Implementation**
- [ ] **Admin Access**: Full access to all pages
  - Facility Manager (view, add, edit, delete)
  - County Dashboards (view all)
  - Uploads Page (view, upload)
  - Reports (view, generate, download)
  - Tickets (view, create, edit, delete)
  
- [ ] **Guest Access**: Limited access
  - Tickets Page: Can create tickets, add their name and required fields
  - Cannot edit/delete tickets
  - Cannot access Facility Manager
  - Cannot access Uploads
  - Cannot access Reports
  - Cannot access County Dashboards (or view-only if needed)

**Step 1.6: Integration & Testing**
- [ ] Protect all routes based on role
- [ ] Protect API endpoints:
  - `/api/facilities/*` - Admin only (except GET for guest if needed)
  - `/api/tickets` - Guest can POST, Admin can all methods
  - `/api/comparisons` - Admin only
  - `/api/reports/*` - Admin only
- [ ] Test admin access to all features
- [ ] Test guest access limitations
- [ ] Test logout functionality

**Deliverables:**
- ✅ Simple authentication system (no user database)
- ✅ Admin and Guest login types
- ✅ Role-based access control
- ✅ Protected routes and API endpoints
- ✅ Simple login UI

---

### Phase 2: Excel Import & Asset Management
**Timeline:** 3-4 weeks  
**Priority:** HIGHEST (Current Focus)  
**Dependencies:** None (can start immediately)

#### Implementation Steps

**Step 2.1: Database Schema Enhancement**
- [ ] Add `assetTag` field to Facility model
- [ ] Add `serialNumber` field to Facility model
- [ ] Create `AssetType` model for custom asset types
- [ ] Create `AssetField` model for custom fields
- [ ] Run migrations

**Step 2.2: Excel Template System** ⚠️ CRITICAL FIRST STEP
- [ ] **Analyze Nyamira Facilities.ods format** (Access the file and understand structure)
  - Identify all columns and data types
  - Map to existing Facility model fields
  - Identify any missing fields that need to be added
- [ ] Create standardized Excel template generator based on .ods format
- [ ] Create template download endpoint (`/api/templates/download`)
- [ ] Support template types matching .ods structure
- [ ] Template validation schema matching .ods format

**Step 2.3: Excel Import Engine**
- [ ] Verify `xlsx` library is installed (already installed ✅)
- [ ] Create Excel parser utility (`lib/excel-parser.ts`)
  - Support both .xlsx and .ods formats
  - Parse based on Nyamira Facilities.ods structure
  - Handle multiple sheets if needed
- [ ] Create field mapping interface
  - Map Excel columns to Facility model fields
  - Handle variations in column names
  - Support optional vs required fields
- [ ] Create data validation engine
  - Validate facility names
  - Validate server types
  - Validate numeric fields (simcardCount)
  - Validate boolean fields (hasLAN)
- [ ] Create duplicate detection logic
  - Check against existing facilities
  - Use fuzzy matching for name variations
  - Provide merge/update options
- [ ] Create import API endpoint (`/api/facilities/import-excel`)
  - Accept Excel file upload
  - Process and validate data
  - Return import results with errors/warnings

**Step 2.4: Excel Import UI**
- [ ] Create Excel upload interface in Facility Manager (`/facility-manager`)
  - Add "Import from Excel" button/tab
  - File upload component
  - Location and system selector
- [ ] Create import preview and validation UI
  - Show parsed data preview
  - Highlight validation errors
  - Show duplicate detection results
  - Allow user to review before importing
- [ ] Create field mapping interface (if needed)
  - Show Excel columns
  - Map to Facility model fields
  - Save mapping preferences
- [ ] Create import results dashboard
  - Show success count
  - List errors/warnings
  - Show skipped duplicates
  - Provide download of error report

**Step 2.5: Database Schema Enhancement** (If needed)
- [ ] Review Facility model against .ods format
- [ ] Add missing fields if required:
  - `assetTag` (String?)
  - `serialNumber` (String?)
  - Any other fields found in .ods
- [ ] Run migrations if schema changes needed

**Step 2.6: Testing & Validation**
- [ ] Test with Nyamira Facilities.ods format (primary test case)
- [ ] Test with .xlsx format (Excel)
- [ ] Validate data integrity after import
- [ ] Test error handling (invalid formats, missing columns, etc.)
- [ ] Test duplicate detection and merging
- [ ] Performance testing with large files (500+ facilities)
- [ ] Test with all counties (Kakamega, Vihiga, Kisumu, Nyamira)

**Deliverables:**
- ✅ Excel import system (.xlsx and .ods support)
- ✅ Template generation matching Nyamira Facilities.ods format
- ✅ Import validation and error reporting
- ✅ Duplicate detection and handling
- ✅ Import preview before final import
- ✅ Asset tag and serial number tracking (if in .ods format)
- ⏳ Custom asset type management (future enhancement)

---

### Phase 3: Enhanced Ticket Management
**Timeline:** 1-2 weeks  
**Priority:** Medium  
**Dependencies:** Phase 1 (for role-based access)

#### Implementation Approach
**Simplified Ticket Assignment**: 
- Guest/Admin creates ticket with their name and location
- Ticket appears in unresolved tickets list
- Support personnel can claim/take tickets from unresolved list
- No user database needed - just name fields

#### Implementation Steps

**Step 3.1: Database Schema Enhancement**
- [ ] **CRITICAL FIRST**: Make `location` field required in Ticket model
  - Change from `location String?` to `location String`
  - Add database migration to set null locations to "Nyamira"
  - Add index on `location` field
- [ ] **CRITICAL**: Add `subcounty` field to Ticket model (REQUIRED for categorization)
  - Add `subcounty String @db.VarChar(100)` (REQUIRED)
  - Migrate existing tickets: match to facilities to get subcounty, set "Unknown" for unmatched
  - Add indexes on `[location, subcounty]` and `[subcounty]`
- [ ] Add `reportedBy` field to Ticket model (String - person's name)
  - Required field - who created the ticket
- [ ] Add `assignedTo` field to Ticket model (String? - support personnel name)
  - Optional - filled when personnel claims ticket
- [ ] Add `supportedBy` field to Ticket model (String? - who resolved it)
  - Optional - filled when ticket is resolved
- [ ] Add `reportedDate` field (DateTime? - allow backdating)
- [ ] Enhance `resolvedDate` field (already exists, ensure it's set on resolution)
- [ ] Add `troubleshootingNotes` field (Text?)
- [ ] Run migrations

**Step 3.2: Ticket Creation Enhancement**
- [ ] Update ticket creation form
  - Add "Your Name" field (required for Guest/Admin)
  - Location selector (REQUIRED - no default, user must select)
  - **Subcounty selector (REQUIRED)** - populate based on selected location
  - Date picker for reported date (optional, defaults to today)
  - Add validation: location and subcounty cannot be empty
- [ ] When ticket is created:
  - Validate location is provided and valid
  - Validate subcounty is provided (required for categorization)
  - Set `reportedBy` = person's name from form
  - Set `location` = selected location (REQUIRED)
  - Set `subcounty` = selected subcounty (REQUIRED)
  - Set `reportedDate` = selected date or current date
  - Set `status` = "open"
  - Ticket appears in unresolved tickets list filtered by location and subcounty

**Step 3.3: Ticket Claiming System**
- [ ] Create "Unresolved Tickets" view/filter
  - Shows tickets with status "open" or "in-progress"
  - **FILTERED BY LOCATION** (default to current user's location or require location selection)
  - Grouped by location (if viewing multiple locations)
  - Shows reportedBy name and location badge
- [ ] Add "Claim Ticket" functionality
  - Support personnel can click "Claim" button on ticket
  - Prompts for their name (or auto-fills if admin logged in)
  - Sets `assignedTo` = personnel name
  - Sets `status` = "in-progress"
  - Ticket moves from "unresolved" to "assigned to [name]"
  - **Location remains unchanged** (ticket stays with its original location)
- [ ] Add "Unclaim Ticket" option (if needed)
  - Admin can unassign ticket
  - Sets `assignedTo` = null
  - Sets `status` back to "open"
  - **Location remains unchanged**

**Step 3.4: Ticket Resolution Enhancement**
- [ ] Update ticket resolution form
  - Add "Resolved By" field (auto-fills if admin, or manual entry)
  - Add solution field (already exists)
  - Add troubleshooting notes field
- [ ] When ticket is resolved:
  - Set `supportedBy` = resolver's name
  - Set `resolvedDate` = current date
  - Set `status` = "resolved"
  - Ticket moves out of unresolved list

**Step 3.5: Backdating Support**
- [ ] Enhance date picker component
  - Allow selecting past dates for `reportedDate`
  - Add date validation (not future dates)
  - Show selected date in ticket display
- [ ] Update ticket creation form
  - Date picker defaults to today
  - Can select past dates for backdating
  - Admin can backdate, Guest can only use today

**Step 3.6: Troubleshooting Tracking**
- [ ] Add troubleshooting issue type
  - Update issue type detection logic
  - Add "troubleshooting" as option in ticket form
- [ ] Create troubleshooting notes UI
  - Add notes field in ticket form
  - Display notes in ticket details
- [ ] Add troubleshooting analytics
  - Include in dashboard analytics
  - Track troubleshooting tickets separately

**Step 3.7: Testing**
- [ ] Test ticket creation with name and location
- [ ] Test ticket claiming workflow
- [ ] Test ticket resolution with resolver name
- [ ] Test backdating functionality
- [ ] Test troubleshooting tracking
- [ ] Validate unresolved tickets list

**Deliverables:**
- ✅ Ticket creation with reporter name and location
- ✅ Unresolved tickets list
- ✅ Ticket claiming system (support personnel can claim tickets)
- ✅ Ticket resolution with resolver tracking
- ✅ Backdating support (admin only)
- ✅ Troubleshooting issue tracking

---

### Phase 4: Multi-County Dashboard Enhancement
**Timeline:** 2-3 weeks  
**Priority:** Medium (After Excel Import)  
**Dependencies:** Phase 2 (Excel Import)  
**Status:** Partially Complete (Nyamira ✅, Multi-County Pending)

#### Implementation Approach
**Strategy**: Convert existing Nyamira dashboard into a unified multi-county dashboard with:
- County selector/switcher
- Same dashboard design (keep as-is)
- County comparison capabilities
- All counties accessible from one dashboard

#### Implementation Steps

**Step 4.1: Convert Nyamira Dashboard to Multi-County Dashboard**
- [ ] **CRITICAL FIRST**: Remove hardcoded "Nyamira" from all data fetching
  - Replace `location=Nyamira` with dynamic location parameter
  - Update all API calls to use location prop/state
  - Ensure location is always specified (no default to "all")
- [ ] Rename `/app/nyamira/page.tsx` to `/app/county-dashboard/page.tsx` (or keep nyamira route but make it multi-county)
- [ ] Add county selector component (dropdown/tabs)
- [ ] Update dashboard to accept `location` parameter/prop
- [ ] Make all data fetching location-aware
- [ ] Keep all existing dashboard features and design
- [ ] Test with all counties (Kakamega, Vihiga, Nyamira, Kisumu)
- [ ] Verify no data mixing between counties

**Step 4.2: Add County Comparison Features**
- [ ] Add comparison mode toggle
- [ ] Allow selecting multiple counties for comparison
- [ ] Create comparison view showing side-by-side or combined metrics
- [ ] Add comparison charts (e.g., server distribution across counties)
- [ ] Test comparison functionality

**Step 4.3: Update Navigation & Routing**
- [ ] Update sidebar to reflect multi-county dashboard
- [ ] Consider keeping `/nyamira` route for backward compatibility (redirects to county dashboard with Nyamira selected)
- [ ] Update any hardcoded references to Nyamira-specific routes

**Step 4.4: Testing & Validation**
- [ ] Test dashboard with all counties
- [ ] Verify data accuracy for each county
- [ ] Test county switching performance
- [ ] Validate comparison features
- [ ] Ensure backward compatibility

**Deliverables:**
- ✅ Nyamira dashboard (Already Complete - will be enhanced)
- [ ] Multi-county dashboard with county switcher
- [ ] County comparison functionality
- [ ] All counties accessible from unified dashboard

---

### Phase 5: System Optimization & Polish
**Timeline:** 2-3 weeks  
**Priority:** Low  
**Dependencies:** Phases 1-4

#### Implementation Steps

**Step 5.1: Performance Optimization**
- [ ] Database query optimization
- [ ] Add caching layer (Redis optional)
- [ ] Optimize dashboard rendering
- [ ] Add pagination for large datasets

**Step 5.2: UI/UX Enhancements**
- [ ] Improve loading states
- [ ] Add error boundaries
- [ ] Enhance mobile responsiveness
- [ ] Add keyboard shortcuts

**Step 5.3: Documentation**
- [ ] User manual
- [ ] Admin guide
- [ ] API documentation
- [ ] Deployment guide

**Step 5.4: Testing & QA**
- [ ] End-to-end testing
- [ ] Security testing
- [ ] Performance testing
- [ ] User acceptance testing

**Deliverables:**
- ✅ Optimized system performance
- ✅ Enhanced user experience
- ✅ Complete documentation
- ✅ Tested and validated system

---

## Technical Specifications

### Database Schema Additions

#### Authentication (No Database Model Needed)
**Simple Session-Based Authentication**:
- Admin credentials stored in environment variables
- Guest credentials stored in environment variables
- Session stored in cookies or Next.js session storage
- No User model needed in database

**Environment Variables**:
```env
ADMIN_PASSWORD=your_admin_password_here
GUEST_PASSWORD=your_guest_password_here
```

**Session Structure**:
```typescript
{
  role: "admin" | "guest",
  authenticated: true,
  expiresAt: Date
}
```

#### AssetType Model
```prisma
model AssetType {
  id          String   @id @default(cuid())
  name        String   @db.VarChar(100)
  description String?  @db.Text
  fields      Json     // Custom field definitions
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@unique([name])
  @@map("asset_types")
}
```

### API Endpoints to Create

#### Authentication (Simplified)
- `POST /api/auth/login` - Login (admin or guest)
  - Body: `{ username: string, password: string }`
  - Returns: `{ role: "admin" | "guest", authenticated: true }`
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current session/role
  - Returns: `{ role: "admin" | "guest" | null, authenticated: boolean }`

#### Excel Import
- `GET /api/templates/download` - Download Excel template
- `POST /api/facilities/import-excel` - Import facilities from Excel
- `GET /api/asset-types` - List asset types
- `POST /api/asset-types` - Create asset type (admin)

#### Reports & Export
- `GET /api/reports/facilities` - Generate facility report
- `GET /api/reports/ndwh-cbs` - Generate NDWH/CBS compliance report
- `GET /api/reports/tickets` - Generate ticket analytics report
- `GET /api/reports/comparison` - Generate county comparison report
- `GET /api/reports/export/:type` - Export report in specified format (excel, pdf, csv)

#### Ticket Enhancement
- `PUT /api/tickets/:id/claim` - Claim ticket (sets assignedTo and status to in-progress)
  - Body: `{ assignedTo: string }` (support personnel name)
  - Location cannot be changed (ticket stays with original location)
- `PUT /api/tickets/:id/resolve` - Resolve ticket with support info
  - Body: `{ supportedBy: string, solution: string, troubleshootingNotes?: string }`
  - Location cannot be changed
- `GET /api/tickets/unresolved` - Get unresolved tickets (open/in-progress)
  - Query params: `location` (REQUIRED - no default to "all")
- `PUT /api/tickets/:id/unclaim` - Unclaim ticket (admin only)
  - Location cannot be changed
- `GET /api/tickets` - Get tickets
  - Query params: `location` (REQUIRED - must specify county)

---

## Progress Tracking

### Phase 0: Data Separation & Migration (CRITICAL)
- [ ] Step 0.1: Data Migration
- [ ] Step 0.2: Database Schema Update
- [ ] Step 0.3: API Enforcement
- [ ] Step 0.4: UI Updates
- [ ] Step 0.5: Nyamira Dashboard Refactoring

**Status:** Not Started  
**Priority:** CRITICAL (Must complete before adding other counties)  
**Timeline:** 2-3 days  
**Target Completion:** Before Phase 2 (Excel Import)

### Phase 1: Simple Authentication System
- [ ] Step 1.1: Simple Authentication Setup
- [ ] Step 1.2: Authentication Infrastructure
- [ ] Step 1.3: Authorization Middleware
- [ ] Step 1.4: Login UI
- [ ] Step 1.5: Access Control Implementation
- [ ] Step 1.6: Integration & Testing

**Status:** Not Started  
**Priority:** High  
**Timeline:** 1 week  
**Target Completion:** TBD

### Phase 2: Excel Import & Asset Management
- [ ] Step 2.1: Database Schema Enhancement
- [ ] Step 2.2: Excel Template System
- [ ] Step 2.3: Excel Import Engine
- [ ] Step 2.4: Asset Management UI
- [ ] Step 2.5: Testing & Validation

**Status:** Not Started  
**Target Completion:** TBD

### Phase 3: Enhanced Ticket Management
- [ ] Step 3.1: Database Schema Enhancement
- [ ] Step 3.2: Ticket Creation Enhancement
- [ ] Step 3.3: Ticket Claiming System
- [ ] Step 3.4: Ticket Resolution Enhancement
- [ ] Step 3.5: Backdating Support
- [ ] Step 3.6: Troubleshooting Tracking
- [ ] Step 3.7: Testing

**Status:** Not Started  
**Priority:** Medium  
**Timeline:** 1-2 weeks  
**Target Completion:** After Phase 1 (Authentication)

### Phase 4: Multi-County Dashboard Enhancement
- [ ] Step 4.1: Convert Nyamira Dashboard to Multi-County Dashboard
- [ ] Step 4.2: Add County Comparison Features
- [ ] Step 4.3: Update Navigation & Routing
- [ ] Step 4.4: Testing & Validation

**Status:** Partially Complete  
**Completed:** ✅ Nyamira Dashboard (fully functional with analytics)  
**Pending:** Multi-county enhancement with county switcher and comparison  
**Target Completion:** After Phase 2 (Excel Import) completion

### Phase 5: Reports System Enhancement
- [ ] Step 5.1: EMR Facility Reports
- [ ] Step 5.2: NDWH/CBS Upload Compliance Reports
- [ ] Step 5.3: Ticket Analytics Reports
- [ ] Step 5.4: County Comparison Reports
- [ ] Step 5.5: Report Generation UI
- [ ] Step 5.6: Export Functionality

**Status:** Not Started  
**Priority:** High  
**Target Completion:** After Phase 2 (Excel Import)

### Phase 6: System Optimization & Polish
- [ ] Step 6.1: Performance Optimization
- [ ] Step 6.2: UI/UX Enhancements
- [ ] Step 6.3: Documentation
- [ ] Step 6.4: Testing & QA

**Status:** Not Started  
**Target Completion:** TBD

---

## Testing & Validation Strategy

### Unit Testing
- [ ] Authentication utilities
- [ ] Excel parser functions
- [ ] Date utilities
- [ ] Facility matching logic

### Integration Testing
- [ ] API endpoint testing
- [ ] Database operations
- [ ] Authentication flow
- [ ] Excel import flow

### End-to-End Testing
- [ ] User login and ticket creation
- [ ] Admin facility import
- [ ] Dashboard data accuracy
- [ ] Multi-user scenarios

### Performance Testing
- [ ] Large Excel file import
- [ ] Dashboard rendering with large datasets
- [ ] Database query performance
- [ ] Concurrent user access

---

## Risk Assessment & Mitigation

### Risk 1: Excel Format Variations
**Impact:** High  
**Probability:** Medium  
**Mitigation:** 
- Create flexible parser with multiple format support
- Provide clear template documentation
- Implement format validation before import

### Risk 2: Authentication Security
**Impact:** Critical  
**Probability:** Low  
**Mitigation:**
- Use industry-standard JWT implementation
- Implement token expiration
- Add rate limiting
- Regular security audits

### Risk 3: Performance with Large Datasets
**Impact:** Medium  
**Probability:** Medium  
**Mitigation:**
- Implement pagination
- Add database indexing
- Use query optimization
- Consider caching layer

---

## Success Criteria

### Phase 0 Success Criteria (Data Separation - CRITICAL)
- ✅ All existing tickets have location = "Nyamira" (no null values)
- ✅ All existing tickets have subcounty set (from facility matching or "Unknown")
- ✅ Ticket location and subcounty fields are required in database schema
- ✅ API endpoints require location and subcounty parameters
- ✅ UI components enforce location and subcounty selection
- ✅ No cross-county data mixing possible
- ✅ Existing Nyamira data remains intact and isolated
- ✅ Nyamira Dashboard is location-aware (not hardcoded)
- ✅ Categorization by subcounty works in analytics
- ✅ Ready to add other counties without data mixing risk

### Phase 1 Success Criteria (Simple Authentication)
- ✅ Admin can log in with admin password
- ✅ Guest can log in with guest password
- ✅ Admin has full access to view and edit everything
- ✅ Guest can only create tickets and add their name/required fields
- ✅ Guest cannot access Facility Manager, Uploads, Reports, or edit/delete tickets
- ✅ All API routes are protected based on role
- ✅ Session management works correctly
- ✅ No user database needed - simple and lightweight

### Phase 2 Success Criteria
- ✅ Excel files can be imported successfully
- ✅ Asset tags and serial numbers are tracked
- ✅ Custom asset types can be created
- ✅ Import validation catches errors
- ✅ Template generation works correctly

### Phase 3 Success Criteria (Enhanced Ticket Management)
- ✅ Guest/Admin can create tickets with their name and location
- ✅ Tickets appear in unresolved tickets list
- ✅ Support personnel can claim tickets from unresolved list
- ✅ Ticket assignment shows who claimed it (`assignedTo`)
- ✅ Ticket resolution tracks who resolved it (`supportedBy`)
- ✅ Backdating works correctly (admin only)
- ✅ Troubleshooting issues are categorized
- ✅ Unresolved tickets view shows all open/in-progress tickets by location

### Phase 2 Success Criteria (Excel Import - CURRENT PRIORITY)
- ✅ Excel files (.xlsx) can be imported successfully
- ✅ ODS files (.ods) can be imported successfully (matching Nyamira Facilities.ods format)
- ✅ All Facility model fields are captured correctly
- ✅ Import validation catches errors before import
- ✅ Duplicate detection works correctly
- ✅ Template generation matches .ods format
- ✅ Import preview shows data before final import
- ✅ Import completes in <30 seconds for 500 facilities
- ✅ Error reporting is clear and actionable

### Phase 4 Success Criteria (Multi-County Dashboard)
- ✅ Multi-county dashboard allows switching between all counties
- ✅ All counties show same dashboard features as Nyamira
- ✅ County comparison functionality works
- ✅ Dashboard performance is acceptable (<3s load time)
- [ ] CBS dashboard shows all counties (future enhancement)
- [ ] Data accuracy is maintained across all counties

### Overall System Success Criteria
- ✅ System handles 1000+ facilities per county
- ✅ System handles 100+ concurrent users
- ✅ Excel import completes in <30 seconds for 500 facilities
- ✅ Dashboard loads in <3 seconds
- ✅ Zero data loss during operations

---

## Notes & Updates

### 2024 Updates
- **Nyamira Dashboard**: Successfully implemented with comprehensive analytics
- **Facility Management**: Enhanced with detailed fields (sublocation, serverType, simcardCount, hasLAN)
- **Excel Export**: Implemented for facility data
- **Ticket System**: Basic ticket management operational

### Current Focus & Next Steps

#### CRITICAL: Data Separation & Migration (Do Before Adding Other Counties)
1. **Migrate Existing Ticket Data**
   - All current tickets are Nyamira data
   - Set `location = 'Nyamira'` for any tickets with null location
   - Match tickets to facilities to get subcounty (set "Unknown" for unmatched)
   - Verify all tickets have location and subcounty set

2. **Make Ticket Location and Subcounty Required**
   - Update Ticket model schema (remove `?` from location, add subcounty field)
   - Add database migration
   - Update API to require location and subcounty parameters
   - Add location and subcounty validation

3. **Enforce Location and Subcounty in All Queries**
   - Update ticket API to always filter by location (and optionally subcounty)
   - Update Nyamira Dashboard to be location-aware (not hardcoded)
   - Add location and subcounty validation utilities
   - Update analytics to use subcounty for categorization

**See `docs/data-separation-strategy.md` for detailed migration plan**

#### Immediate Priority: Excel Import System (Phase 2)
1. **Access and analyze Nyamira Facilities.ods file**
   - Document all columns and data structure
   - Map columns to Facility model fields
   - Identify any missing fields

2. **Implement Excel Import Engine**
   - Create parser for .ods and .xlsx formats
   - Build validation system
   - Create import UI in Facility Manager
   - **Ensure location is always specified during import**

3. **Test with real data**
   - Import Nyamira Facilities.ods
   - Validate all data captured correctly
   - Test with other counties (after data separation is complete)

#### Next Priority: Reports System Enhancement (Phase 5)
1. **Enhance Reports Page**
   - Separate report types (EMR, NDWH/CBS, Tickets, Comparison)
   - Add filters and format selection
   - Preview functionality

2. **Implement Export Functionality**
   - Excel export with multiple sheets
   - PDF export with charts
   - CSV export for simple data

3. **Create Report Templates**
   - EMR Facility Reports
   - NDWH/CBS Compliance Reports
   - Ticket Analytics Reports
   - County Comparison Reports

#### Future Enhancements
- Multi-county dashboard enhancement (convert Nyamira dashboard)
- Simple Authentication system (Admin/Guest only - Phase 1)
- Enhanced Ticket Management (Phase 3) - Ticket claiming workflow
- Custom asset type management

### Important Notes
- **Dashboard Strategy**: Convert existing Nyamira dashboard to multi-county dashboard (keep design as-is)
- **Excel Import Priority**: This is the current focus - need to capture facility data efficiently
- **System Architecture**: See `docs/system-analysis.md` for detailed architecture analysis

### Important Notes

#### Data Separation (CRITICAL - Current Data is Nyamira-Only)
- **Current State**: All existing EMR facility data and tickets are Nyamira-specific
- **Facilities**: Already location-separated ✅ (API requires location parameter)
- **Tickets**: Location field exists but is optional ⚠️ - needs to be required
- **Tickets**: Subcounty field does NOT exist ⚠️ - needs to be added and required (for categorization)
- **Risk**: When adding other counties, existing Nyamira data could mix if not properly isolated
- **Action Required**: 
  - Make ticket location required (database schema)
  - Add ticket subcounty field (REQUIRED for categorization)
  - Migrate existing tickets (set null location → "Nyamira", match subcounty from facilities)
  - Enforce location and subcounty in all API queries
  - Update Nyamira Dashboard to be location-aware (not hardcoded)
  - Update analytics to use subcounty for categorization
- **See**: `docs/data-separation-strategy.md` for detailed migration plan

#### System Separation (CRITICAL)
- **EMR Facility Management & Ticketing System**: 
  - Manages facility data, network infrastructure, equipment, inventory
  - Includes Facility Manager, County Dashboards, Tickets
  - SEPARATE from NDWH/CBS monitoring
  
- **NDWH/CBS Upload Monitoring System**:
  - Tracks upload compliance to NDWH and CBS systems
  - Compares uploaded lists against master facility lists
  - INDEPENDENT system - should not be mixed with EMR facility management
  
- **Reports System**:
  - Generates downloadable reports for all systems
  - Supports Excel, PDF, CSV formats
  - Separate report types for EMR vs NDWH/CBS

#### Key Architectural Decisions
- NDWH/CBS upload monitoring is SEPARATE from EMR facility management
- EMR system manages facility data, equipment, infrastructure, tickets
- Reports can be generated for both systems independently
- System field in Facility model: Used for organizational purposes, but EMR facility data is the source of truth
- **Authentication**: Simple two-role system (Admin/Guest) - no user database needed
  - Admin: Full access to view and edit everything
  - Guest: Can only create tickets and add their name/required fields
  - Credentials stored in environment variables, session-based auth
  - Much simpler than full JWT/RBAC system

See `docs/system-analysis.md` for detailed architecture analysis and requirements comparison

---

**Document Maintenance:** This document should be updated after each phase completion and during testing phases to reflect actual progress and any changes to requirements.
