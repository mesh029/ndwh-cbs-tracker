# Facility Reporting Dashboard

A modern, professional dashboard for tracking facility reporting status across multiple locations and systems (NDWH and CBS).

## Features

- **Multi-Location Support**: Track facilities across Kakamega, Vihiga, Nyamira, and Kisumu
- **Dual System Support**: Manage both NDWH and CBS systems separately
- **Master Facility Management**: Upload and manage master facility lists per location
- **Smart Comparison**: Case-insensitive matching with automatic classification
- **Interactive Dashboard**: Visual charts and progress tracking
- **Export Functionality**: Export reports as CSV or text files
- **Local Storage**: All data persists in browser local storage

## Getting Started

### Quick Start

For detailed setup instructions, see **[STARTUP_GUIDE.md](./STARTUP_GUIDE.md)**

**Quick setup (if database and .env already configured):**
```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000)

### Prerequisites

- Node.js 18+ installed
- MySQL server running locally
- MySQL credentials: username `root`, password `test`

### Installation Steps

1. **Create database:**
```bash
mysql -uroot -ptest -e "CREATE DATABASE facility_dashboard;"
```

2. **Create `.env` file:**
```bash
echo 'DATABASE_URL="mysql://root:test@localhost:3306/facility_dashboard?schema=public"' > .env
```

3. **Install dependencies:**
```bash
npm install
```

4. **Set up Prisma:**
```bash
npx prisma generate
npx prisma db push
```

5. **Start development server:**
```bash
npm run dev
```

6. **Open browser:**
Navigate to [http://localhost:3000](http://localhost:3000)

**For complete setup instructions, troubleshooting, and more details, see [STARTUP_GUIDE.md](./STARTUP_GUIDE.md)**

## Usage

### Facility Manager

1. Select a system (NDWH or CBS) and location
2. Add facilities individually or bulk upload via text/file
3. Master facilities are stored per location and system

### Dashboard

1. View reporting status across all locations
2. Enter reported facilities via the input area
3. See real-time comparison results with visual charts
4. Filter by location and search facilities

### Reports

1. Generate summary reports for selected system/location
2. Export missing facilities as CSV or text
3. Copy missing facilities to clipboard

## Technology Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **shadcn/ui** (Amber Minimal theme)
- **Recharts** (Data visualization)
- **Prisma** (ORM)
- **MySQL** (Database)

## Data Structure

All data is stored in MySQL database using Prisma ORM. The database schema includes:

- **facilities** table with columns:
  - `id`: Unique identifier (CUID)
  - `name`: Facility name
  - `system`: System type (NDWH or CBS)
  - `location`: Location (Kakamega, Vihiga, Nyamira, Kisumu)
  - `isMaster`: Boolean flag (true for master facilities, false for reported)
  - `createdAt`: Creation timestamp
  - `updatedAt`: Last update timestamp

See `DATABASE_SETUP.md` for detailed database setup instructions.

## Features Details

### Smart Comparison Engine

- Case-insensitive matching
- Automatic whitespace trimming
- Duplicate prevention
- Normalized value comparison

### Export Options

- **CSV Export**: Structured data with all location details
- **Text Export**: Human-readable summary report
- **Clipboard Copy**: Quick copy of missing facilities

## License

MIT
