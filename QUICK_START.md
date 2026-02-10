# Quick Start Guide

> **For complete setup instructions, see [STARTUP_GUIDE.md](./STARTUP_GUIDE.md)**

## Prerequisites Check

```bash
# Verify Node.js
node --version  # Should be v18+

# Verify MySQL is running
mysql -uroot -ptest -e "SELECT 1"
```

## Quick Setup

### 1. Create Database
```bash
mysql -uroot -ptest -e "CREATE DATABASE facility_dashboard;"
```

### 2. Create .env File
```bash
echo 'DATABASE_URL="mysql://root:test@localhost:3306/facility_dashboard?schema=public"' > .env
```

### 3. Install & Setup
```bash
npm install
npx prisma generate
npx prisma db push
```

### 4. (Optional) Add Demo Data
```bash
node scripts/add-demo-data.js
```

### 5. Start Server
```bash
npm run dev
```

### 6. Open Browser
Navigate to [http://localhost:3000](http://localhost:3000)

---

**For detailed instructions, troubleshooting, and more information, see [STARTUP_GUIDE.md](./STARTUP_GUIDE.md)**

## Project Structure

```
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx           # Dashboard page
│   ├── facility-manager/  # Facility Manager page
│   └── reports/           # Reports page
├── components/
│   ├── ui/                # shadcn/ui components
│   ├── dashboard.tsx      # Main dashboard component
│   ├── facility-manager.tsx
│   ├── reporting-input.tsx
│   ├── reports.tsx
│   └── sidebar.tsx
├── hooks/
│   └── use-facility-data.ts  # Custom hook for facility data
├── lib/
│   ├── storage.ts         # Local storage utilities
│   └── utils.ts          # Utility functions
└── package.json
```

## Key Features

1. **Facility Manager** (`/facility-manager`)
   - Add master facilities per location/system
   - Bulk upload via text or file
   - Edit/remove facilities

2. **Dashboard** (`/`)
   - View reporting status across locations
   - Enter reported facilities
   - Interactive charts (bar & pie)
   - Search and filter

3. **Reports** (`/reports`)
   - Generate summary reports
   - Export CSV/text
   - Copy missing facilities to clipboard

## Data Storage

All data is stored in browser local storage under the key `facility-reporting-data`.

Data structure:
```json
{
  "NDWH": {
    "Kakamega": {
      "masterFacilities": ["Facility 1", "Facility 2"],
      "reportedFacilities": ["Facility 1"]
    }
  },
  "CBS": { ... }
}
```

## Usage Tips

1. **Adding Master Facilities**: Go to Facility Manager, select system/location, add facilities individually or bulk upload
2. **Reporting**: Go to Dashboard, use the Reporting Input section to enter reported facilities
3. **Viewing Status**: Dashboard automatically compares reported vs master and shows missing facilities
4. **Exporting**: Go to Reports page to export data as CSV or text files
