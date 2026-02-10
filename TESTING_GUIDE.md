# Testing Guide

## ✅ Fixed Issues

1. **ReferenceError: selectedSystem is not defined** - Fixed in `hooks/use-facility-data.ts`
2. **Type errors** - Fixed function signatures
3. **ESLint errors** - Fixed unescaped quotes
4. **Build errors** - All resolved, build passes successfully

## Testing Checklist

### 1. Bulk Entry with Subcounties

**Test Steps:**
1. Go to Facility Manager
2. Select system (NDWH/CBS) and location
3. Click "Bulk" tab
4. **Step 1:** Paste facility names:
   ```
   Kakamega County Referral Hospital
   St. Mary's Hospital Mumias
   Kakamega General Hospital
   ```
5. **Step 2:** Paste subcounties in same order:
   ```
   Kakamega Central
   Mumias East
   Kakamega North
   ```
6. Click "Add Facilities"
7. Verify facilities are added with correct subcounties

**Expected Result:**
- Facilities added successfully
- First facility matched with first subcounty
- Second with second, etc.
- If fewer subcounties, remaining facilities have null subcounty

### 2. Case-Insensitive Matching

**Test Steps:**
1. Add facility: "Kakamega Hospital"
2. In Reporting Input, paste: "KAKAMEGA HOSPITAL" or "kakamega hospital"
3. Process reports
4. Check dashboard

**Expected Result:**
- Facility matches regardless of case
- Shows as "Reported" in dashboard

### 3. Edit Facility with Subcounty

**Test Steps:**
1. Go to Facility Manager
2. Click edit icon on any facility
3. Change facility name
4. Change/add subcounty
5. Save

**Expected Result:**
- Facility updates successfully
- Subcounty updates correctly
- No duplicate errors (case-insensitive check)

### 4. Remove All Facilities

**Test Steps:**
1. Go to Facility Manager
2. Ensure you have facilities
3. Click "Remove All" button
4. Confirm deletion

**Expected Result:**
- All facilities removed
- Success message shown
- List is empty

### 5. Reports Generation

**Test Steps:**
1. Go to Reports page
2. Select system and location
3. Click "Export CSV" or "Export Text"
4. Verify file downloads

**Expected Result:**
- File downloads successfully
- Contains correct data
- Includes facility names and subcounties

### 6. Dark Mode

**Test Steps:**
1. Click theme toggle in sidebar
2. Switch between Light/Dark/System
3. Verify charts adapt
4. Check all components render correctly

**Expected Result:**
- Theme switches smoothly
- All components visible
- Charts adapt to theme
- No visual glitches

## Build Status

✅ **Build passes successfully**
- No TypeScript errors
- No ESLint errors
- All components compile
- Production build ready

## Known Working Features

- ✅ Add single facility with subcounty
- ✅ Bulk add facilities with subcounties (two-step)
- ✅ Edit facilities (name + subcounty)
- ✅ Remove individual facilities
- ✅ Remove all facilities
- ✅ Case-insensitive matching
- ✅ Reporting input (name only, no subcounty needed)
- ✅ Dashboard charts (4 types)
- ✅ Reports generation (CSV/Text)
- ✅ Dark mode toggle
- ✅ Search and filter

## Quick Test Commands

```bash
# Build test
npm run build

# Type check
npx tsc --noEmit

# Lint check
npm run lint

# Run dev server
npm run dev
```
