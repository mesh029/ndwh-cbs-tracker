# Migration from Local Storage to MySQL/Prisma

## What Changed

The application has been migrated from browser local storage to MySQL database with Prisma ORM.

## Key Changes

### 1. Storage Layer
- **Old**: `lib/storage.ts` - Used browser localStorage
- **New**: `lib/storage-api.ts` - Uses API calls to MySQL database

### 2. Database Schema
- Single `facilities` table stores all facility data
- Indexed by `system`, `location`, and `isMaster` for efficient queries

### 3. API Routes
- New API routes at `/api/facilities` handle all CRUD operations
- GET, POST, PUT, DELETE methods supported

### 4. Components
- All components now use async/await for database operations
- Loading states added for better UX

## Migration Steps for Existing Data

If you have existing data in local storage, you can migrate it:

1. Export data from browser console:
```javascript
const data = JSON.parse(localStorage.getItem('facility-reporting-data'))
console.log(JSON.stringify(data, null, 2))
```

2. Use the Facility Manager UI to re-import master facilities
3. Use the Reporting Input to re-import reported facilities

## Benefits

- **Persistent**: Data survives browser cache clearing
- **Multi-user**: Multiple users can access the same data
- **Scalable**: Database can handle large datasets efficiently
- **Backup**: Easy to backup and restore database
- **Analytics**: Can run SQL queries for advanced reporting

## API Endpoints

### GET /api/facilities
Query parameters:
- `system`: NDWH or CBS
- `location`: Kakamega, Vihiga, Nyamira, or Kisumu
- `isMaster`: true or false (optional)

### POST /api/facilities
Body:
```json
{
  "system": "NDWH",
  "location": "Kakamega",
  "facilities": ["Facility 1", "Facility 2"],
  "isMaster": true
}
```

### PUT /api/facilities
Replaces all facilities of the specified type (used for reported facilities)

### DELETE /api/facilities
Query parameters:
- `system`: Required
- `location`: Required
- `isMaster`: Optional
- `name`: Optional (to delete specific facility)
