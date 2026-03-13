# Aiven MySQL Database Setup Guide

This guide will help you deploy and connect your MySQL database on Aiven.

## Prerequisites

- An Aiven account (sign up at https://aiven.io if you don't have one)
- Your project uses MySQL (configured in `prisma/schema.prisma`)

## Step 1: Create MySQL Service on Aiven

1. **Log in to Aiven Console**
   - Go to https://console.aiven.io/
   - Sign in with your account

2. **Create a New Service**
   - Click "Create service" or "+ New service"
   - Select **MySQL** as the service type
   - Choose your preferred:
     - **Cloud provider** (AWS, Google Cloud, Azure, etc.)
     - **Region** (choose closest to your deployment)
     - **Service plan** (start with "Startup" for development, scale up for production)
   - Give your service a name (e.g., `ndwh-cbs-mysql`)
   - Click "Create service"

3. **Wait for Service Creation**
   - Aiven will provision your MySQL instance (takes 2-5 minutes)
   - You'll see a green "Running" status when ready

## Step 2: Get Connection Details

1. **Open Your Service**
   - Click on your MySQL service name in the Aiven console

2. **Get Connection String**
   - Go to the **Overview** tab
   - Scroll to **Connection information**
   - You'll see:
     - **Host** (e.g., `your-service-name.a.aivencloud.com`)
     - **Port** (usually `25060` for MySQL)
     - **Database name** (default is `defaultdb`)
     - **Username** (default is `avnadmin`)
     - **Password** (click "Show" to reveal)

3. **Download SSL Certificate (Optional but Recommended)**
   - Go to the **Overview** tab
   - Scroll to **Connection information**
   - Click "Download CA certificate" to get the SSL certificate
   - Save it as `ca.pem` in your project root (or note the path)

## Step 3: Configure Your Application

### Option A: Using Connection String (Recommended)

1. **Get the Connection String**
   - In Aiven console, go to your service → **Overview** tab
   - Find **Connection string** section
   - Copy the MySQL connection string (it looks like):
     ```
     mysql://avnadmin:PASSWORD@HOST:PORT/DATABASE?ssl-mode=REQUIRED
     ```

2. **Update .env file**
   - Create or update `.env` in your project root:
     ```bash
     DATABASE_URL="mysql://avnadmin:YOUR_PASSWORD@YOUR_HOST:YOUR_PORT/defaultdb?ssl-mode=REQUIRED"
     ```
   - Replace:
     - `YOUR_PASSWORD` with your actual password
     - `YOUR_HOST` with your Aiven host
     - `YOUR_PORT` with your Aiven port (usually 25060)

### Option B: Using SSL Certificate

If you want to use SSL certificate for enhanced security:

```bash
DATABASE_URL="mysql://avnadmin:YOUR_PASSWORD@YOUR_HOST:YOUR_PORT/defaultdb?ssl-mode=REQUIRED&ssl-ca=./ca.pem"
```

**Note:** Make sure `ca.pem` is in your project root or update the path accordingly.

## Step 4: Test Connection

1. **Generate Prisma Client**
   ```bash
   npx prisma generate
   ```

2. **Test Database Connection**
   ```bash
   npx prisma db pull
   ```
   This will connect to your Aiven database and pull the current schema.

## Step 5: Run Migrations

1. **Push Schema to Aiven**
   ```bash
   npx prisma db push
   ```
   This will create all tables and indexes in your Aiven database.

   **Alternative:** If you prefer migrations:
   ```bash
   npx prisma migrate dev --name init
   ```

## Step 6: Verify Setup

1. **Check Tables Created**
   - In Aiven console, go to your service → **Databases** tab
   - You should see your database
   - Click on it to see tables: `facilities`, `server_assets`, `router_assets`, `simcard_assets`, `lan_assets`, `tickets`, `comparison_history`

2. **Test Application**
   ```bash
   npm run dev
   ```
   - Start your Next.js app
   - Try accessing the application
   - Check if data loads correctly

## Step 7: Migrate Existing Data (If Applicable)

If you have existing data in a local database:

1. **Export from Local Database**
   ```bash
   mysqldump -uroot -ptest facility_dashboard > backup.sql
   ```

2. **Import to Aiven**
   - Use Aiven's web console → **Databases** → **Query editor**
   - Or use MySQL client:
     ```bash
     mysql -h YOUR_HOST -P YOUR_PORT -u avnadmin -p defaultdb < backup.sql
     ```

## Security Best Practices

1. **Never commit `.env` file**
   - Ensure `.env` is in `.gitignore`
   - Use environment variables in production

2. **Use Connection Pooling**
   - Aiven provides connection pooling automatically
   - Your Prisma client already handles connection pooling

3. **Enable SSL**
   - Always use `ssl-mode=REQUIRED` in production
   - Download and use the CA certificate for enhanced security

4. **Rotate Passwords Regularly**
   - In Aiven console → Service → **Users** tab
   - Reset passwords periodically

## Troubleshooting

### Connection Timeout
- Check firewall rules in Aiven console
- Ensure your IP is whitelisted (if IP restrictions are enabled)
- Verify host and port are correct

### SSL Certificate Error
- Ensure `ssl-mode=REQUIRED` is in connection string
- Download fresh CA certificate from Aiven console
- Verify certificate path is correct

### Authentication Failed
- Double-check username and password
- Ensure you're using `avnadmin` (default) or your custom user
- Reset password in Aiven console if needed

### Schema Sync Issues
- Run `npx prisma generate` after schema changes
- Use `npx prisma db push` to sync schema
- Check Prisma logs for detailed errors

## Production Deployment

For production deployments:

1. **Use Environment Variables**
   - Set `DATABASE_URL` in your hosting platform (Vercel, Railway, etc.)
   - Never hardcode credentials

2. **Enable Backups**
   - In Aiven console → Service → **Backups**
   - Enable automatic backups
   - Set retention period

3. **Monitor Performance**
   - Use Aiven's built-in monitoring
   - Set up alerts for connection issues
   - Monitor query performance

4. **Scale as Needed**
   - Upgrade service plan as your data grows
   - Aiven allows easy scaling without downtime

## Additional Resources

- [Aiven MySQL Documentation](https://docs.aiven.io/docs/products/mysql)
- [Prisma MySQL Guide](https://www.prisma.io/docs/concepts/database-connectors/mysql)
- [Aiven Connection Strings](https://docs.aiven.io/docs/products/mysql/howto/connect-mysql)

---

**Need Help?**
- Check Aiven console logs for detailed error messages
- Review Prisma logs: `npx prisma --help`
- Aiven support: https://help.aiven.io/
