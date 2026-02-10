# Startup Guide - Facility Reporting Dashboard

Complete step-by-step guide to get the application running.

## Prerequisites

Before starting, ensure you have the following installed:

- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **MySQL Server** (running locally)
- **npm** or **pnpm** package manager

### Verify Prerequisites

```bash
# Check Node.js version
node --version  # Should be v18 or higher

# Check npm version
npm --version

# Check MySQL is running
mysql -uroot -ptest -e "SELECT 1"
```

## Step-by-Step Setup

### Step 1: Navigate to Project Directory

```bash
cd "/home/kenyaemr/Documents/WORK/NATIONAL DATA WARE HOUSE/ndwh & cbs"
```

### Step 2: Create Database

Create the MySQL database:

```bash
mysql -uroot -ptest -e "CREATE DATABASE IF NOT EXISTS facility_dashboard;"
```

**Alternative:** Use the provided setup script:
```bash
chmod +x scripts/setup-db.sh
./scripts/setup-db.sh
```

### Step 3: Set Up Environment Variables

Create a `.env` file in the project root:

```bash
cat > .env << 'EOF'
DATABASE_URL="mysql://root:test@localhost:3306/facility_dashboard?schema=public"
EOF
```

**Note:** Adjust the connection string if your MySQL credentials differ:
- Username: `root`
- Password: `test`
- Host: `localhost`
- Port: `3306`
- Database: `facility_dashboard`

### Step 4: Install Dependencies

Install all required npm packages:

```bash
npm install
```

This will install:
- Next.js and React
- Prisma ORM
- shadcn/ui components
- Recharts for charts
- next-themes for dark mode
- And all other dependencies

### Step 5: Generate Prisma Client

Generate the Prisma client for database access:

```bash
npx prisma generate
```

### Step 6: Run Database Migrations

Push the database schema to MySQL:

```bash
npx prisma db push
```

This creates the `facilities` table with the required structure.

### Step 7: (Optional) Add Demo Data

To populate the database with sample data for testing:

```bash
node scripts/add-demo-data.js
```

This adds:
- NDWH: 30 master facilities across 4 locations
- CBS: 18 master facilities across 4 locations
- Partial reporting data for demonstration

### Step 8: Start Development Server

Start the Next.js development server:

```bash
npm run dev
```

You should see output like:
```
▲ Next.js 14.2.5
- Local:        http://localhost:3000
- ready started server on 0.0.0.0:3000
```

### Step 9: Access the Application

Open your browser and navigate to:

**http://localhost:3000**

## Quick Start (One-Liner)

If you've already set up the database and `.env` file:

```bash
npm install && npx prisma generate && npx prisma db push && npm run dev
```

## Troubleshooting

### Database Connection Issues

**Error:** `Error: P1012: Environment variable not found: DATABASE_URL`

**Solution:** Ensure `.env` file exists in the project root with the correct `DATABASE_URL`.

**Error:** `Can't connect to MySQL server`

**Solution:** 
1. Verify MySQL is running: `sudo systemctl status mysql`
2. Check credentials match your MySQL setup
3. Verify database exists: `mysql -uroot -ptest -e "SHOW DATABASES;"`

### Port Already in Use

**Error:** `Port 3000 is already in use`

**Solution:** 
- Kill the process using port 3000: `lsof -ti:3000 | xargs kill -9`
- Or use a different port: `PORT=3001 npm run dev`

### Prisma Issues

**Error:** `Prisma schema validation error`

**Solution:**
1. Check `prisma/schema.prisma` file exists
2. Verify DATABASE_URL format is correct
3. Run `npx prisma validate` to check schema

**Error:** `Table already exists`

**Solution:** 
- Use `npx prisma db push --accept-data-loss` to reset
- Or manually drop table: `mysql -uroot -ptest facility_dashboard -e "DROP TABLE facilities;"`

### Module Not Found Errors

**Error:** `Cannot find module '@prisma/client'`

**Solution:**
```bash
npm install
npx prisma generate
```

## Production Build

To build for production:

```bash
# Build the application
npm run build

# Start production server
npm start
```

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | MySQL connection string | `mysql://user:pass@host:port/db?schema=public` |

## Project Structure

```
ndwh & cbs/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   ├── facility-manager/  # Facility Manager page
│   ├── reports/          # Reports page
│   └── page.tsx          # Dashboard page
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   └── ...               # Custom components
├── hooks/                # Custom React hooks
├── lib/                  # Utilities and API functions
├── prisma/               # Prisma schema
├── scripts/              # Utility scripts
├── .env                  # Environment variables (create this)
└── package.json         # Dependencies
```

## Common Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm run start            # Start production server
npm run lint             # Run ESLint

# Database
npx prisma generate      # Generate Prisma client
npx prisma db push       # Push schema to database
npx prisma studio        # Open Prisma Studio (database GUI)

# Demo Data
node scripts/add-demo-data.js  # Add sample data
```

## Next Steps After Startup

1. **Explore the Dashboard** - View charts and reporting status
2. **Add Facilities** - Go to Facility Manager and add master facilities
3. **Test Reporting** - Use Reporting Input to test case-insensitive matching
4. **Generate Reports** - Export reports from the Reports page
5. **Toggle Dark Mode** - Click the theme toggle in the sidebar

## Support

If you encounter issues:

1. Check the console for error messages
2. Verify all prerequisites are installed
3. Ensure MySQL is running and accessible
4. Check that `.env` file exists with correct `DATABASE_URL`
5. Try regenerating Prisma client: `npx prisma generate`

## Default Credentials

- **MySQL Username:** `root`
- **MySQL Password:** `test`
- **Database Name:** `facility_dashboard`
- **Application URL:** `http://localhost:3000`

---

**Happy coding! 🚀**
