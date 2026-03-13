# Aiven MySQL Quick Start

## Quick Setup (5 minutes)

### 1. Create Aiven MySQL Service

1. Go to https://console.aiven.io/
2. Click "Create service" → Select **MySQL**
3. Choose cloud provider and region
4. Select plan (Startup for dev, Business for production)
5. Name it (e.g., `ndwh-cbs-mysql`)
6. Click "Create service"
7. Wait 2-5 minutes for provisioning

### 2. Get Connection String

1. Open your MySQL service in Aiven console
2. Go to **Overview** tab
3. Find **Connection string** section
4. Copy the MySQL connection string

### 3. Configure Application

**Option A: Use the helper script (Recommended)**
```bash
./scripts/setup-aiven.sh
```

**Option B: Manual setup**
1. Create `.env` file:
   ```bash
   DATABASE_URL="mysql://avnadmin:YOUR_PASSWORD@YOUR_HOST:25060/defaultdb?ssl-mode=REQUIRED"
   ```
2. Replace `YOUR_PASSWORD` and `YOUR_HOST` with values from Aiven console

### 4. Run Migrations

```bash
# Generate Prisma client
npx prisma generate

# Push schema to Aiven
npx prisma db push
```

### 5. Verify

```bash
# Start your app
npm run dev
```

Check Aiven console → Databases → Your database → Tables to see created tables.

## Connection String Format

```
mysql://USERNAME:PASSWORD@HOST:PORT/DATABASE?ssl-mode=REQUIRED
```

Example:
```
mysql://avnadmin:abc123xyz@my-service.a.aivencloud.com:25060/defaultdb?ssl-mode=REQUIRED
```

## Troubleshooting

**Connection timeout?**
- Check Aiven console → Service is "Running"
- Verify host and port are correct
- Check if IP whitelist is enabled

**Authentication failed?**
- Double-check username (usually `avnadmin`)
- Reset password in Aiven console if needed
- Ensure password doesn't have special characters that need URL encoding

**SSL errors?**
- Ensure `ssl-mode=REQUIRED` is in connection string
- Download CA certificate from Aiven console if needed

## Next Steps

- See `AIVEN_SETUP.md` for detailed guide
- Enable backups in Aiven console
- Set up monitoring and alerts
- Scale service plan as needed
