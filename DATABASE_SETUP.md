# Database Setup Guide

## Prerequisites

- MySQL server running locally
- Username: `root`
- Password: `test`

## Setup Steps

1. **Create the database:**
```sql
CREATE DATABASE facility_dashboard;
```

2. **Set up environment variables:**
Create a `.env` file in the root directory with:
```
DATABASE_URL="mysql://root:test@localhost:3306/facility_dashboard?schema=public"
```

3. **Install dependencies:**
```bash
npm install
```

4. **Generate Prisma Client:**
```bash
npx prisma generate
```

5. **Run migrations:**
```bash
npx prisma migrate dev --name init
```

Or if you prefer to push the schema directly:
```bash
npx prisma db push
```

## Database Schema

The application uses a single `facilities` table with the following structure:

- `id`: Unique identifier (CUID)
- `name`: Facility name (VARCHAR 500)
- `system`: System type - NDWH or CBS (VARCHAR 10)
- `location`: Location - Kakamega, Vihiga, Nyamira, or Kisumu (VARCHAR 50)
- `isMaster`: Boolean flag - true for master facilities, false for reported facilities
- `createdAt`: Timestamp
- `updatedAt`: Timestamp

## Indexes

The schema includes indexes on:
- `(system, location, isMaster)` - For efficient queries
- `(system, location)` - For location-based queries

## API Endpoints

The application provides REST API endpoints at `/api/facilities`:

- **GET**: Fetch facilities with query parameters (system, location, isMaster)
- **POST**: Create facilities (bulk)
- **PUT**: Replace facilities (used for reported facilities)
- **DELETE**: Delete facilities

## Troubleshooting

If you encounter connection issues:

1. Verify MySQL is running: `mysql -uroot -ptest`
2. Check the database exists: `SHOW DATABASES;`
3. Verify the connection string in `.env`
4. Run `npx prisma db pull` to sync schema if needed
