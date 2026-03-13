# Connecting to Aiven MySQL with MySQL Clients

This guide shows you how to connect to your Aiven MySQL database using various MySQL clients.

## Connection Details

- **Host:** `mysql-20c9b725-theeoneeyeddragon-a8dc.f.aivencloud.com`
- **Port:** `10456`
- **Database:** `defaultdb`
- **Username:** `avnadmin`
- **Password:** `YOUR_AIVEN_PASSWORD`
- **SSL:** Required

## Option 1: Command Line MySQL Client

### Install MySQL Client (if not installed)

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install mysql-client
```

**macOS:**
```bash
brew install mysql-client
```

**Windows:**
Download from: https://dev.mysql.com/downloads/mysql/

### Connect Using Command Line

**Basic connection:**
```bash
mysql -h mysql-20c9b725-theeoneeyeddragon-a8dc.f.aivencloud.com \
      -P 10456 \
      -u avnadmin \
      -p \
      defaultdb
```

When prompted, enter your password from `.env` file or Aiven console

**With SSL (recommended):**
```bash
mysql -h mysql-20c9b725-theeoneeyeddragon-a8dc.f.aivencloud.com \
      -P 10456 \
      -u avnadmin \
      -p \
      --ssl-mode=REQUIRED \
      defaultdb
```

**With SSL Certificate (most secure):**
1. Download CA certificate from Aiven console:
   - Go to your service → Overview → Connection information
   - Click "Download CA certificate"
   - Save as `ca.pem` in your project directory

2. Connect with certificate:
```bash
mysql -h mysql-20c9b725-theeoneeyeddragon-a8dc.f.aivencloud.com \
      -P 10456 \
      -u avnadmin \
      -p \
      --ssl-mode=REQUIRED \
      --ssl-ca=ca.pem \
      defaultdb
```

### Useful Commands Once Connected

```sql
-- Show all tables
SHOW TABLES;

-- Describe a table structure
DESCRIBE facilities;

-- Count records in a table
SELECT COUNT(*) FROM facilities;

-- View all facilities
SELECT * FROM facilities LIMIT 10;

-- Exit MySQL client
EXIT;
```

## Option 2: MySQL Workbench

### Setup Steps

1. **Download MySQL Workbench**
   - https://dev.mysql.com/downloads/workbench/

2. **Create New Connection**
   - Open MySQL Workbench
   - Click "+" next to "MySQL Connections"
   - Fill in connection details:

   **Connection Name:** `Aiven MySQL`
   
   **Connection Method:** `Standard (TCP/IP)`
   
   **Hostname:** `mysql-20c9b725-theeoneeyeddragon-a8dc.f.aivencloud.com`
   
   **Port:** `10456`
   
   **Username:** `avnadmin`
   
   **Password:** (Get from `.env` file or Aiven console)
   
   **Default Schema:** `defaultdb`

3. **Configure SSL**
   - Click "SSL" tab
   - Select "Use SSL" checkbox
   - SSL Mode: `REQUIRED`
   - (Optional) Download CA certificate from Aiven and specify path

4. **Test Connection**
   - Click "Test Connection"
   - If successful, click "OK" to save

5. **Connect**
   - Double-click the connection to connect

## Option 3: DBeaver

### Setup Steps

1. **Download DBeaver**
   - https://dbeaver.io/download/

2. **Create New Connection**
   - Click "New Database Connection" (plug icon)
   - Select "MySQL"
   - Click "Next"

3. **Enter Connection Details**
   - **Host:** `mysql-20c9b725-theeoneeyeddragon-a8dc.f.aivencloud.com`
   - **Port:** `10456`
   - **Database:** `defaultdb`
   - **Username:** `avnadmin`
   - **Password:** `YOUR_AIVEN_PASSWORD`

4. **Configure SSL**
   - Click "SSL" tab
   - Check "Use SSL"
   - SSL Mode: `REQUIRED`
   - (Optional) Download CA certificate and specify path

5. **Test Connection**
   - Click "Test Connection"
   - If driver is missing, DBeaver will prompt to download it
   - Click "Finish" when successful

## Option 4: TablePlus

### Setup Steps

1. **Download TablePlus**
   - https://tableplus.com/

2. **Create New Connection**
   - Click "Create a new connection"
   - Select "MySQL"

3. **Enter Details**
   - **Name:** `Aiven MySQL`
   - **Host:** `mysql-20c9b725-theeoneeyeddragon-a8dc.f.aivencloud.com`
   - **Port:** `10456`
   - **User:** `avnadmin`
   - **Password:** `YOUR_AIVEN_PASSWORD`
   - **Database:** `defaultdb`

4. **SSL Settings**
   - Click "Advanced"
   - Enable "Use SSL"
   - SSL Mode: `REQUIRED`

5. **Connect**
   - Click "Connect"

## Option 5: VS Code MySQL Extension

### Setup Steps

1. **Install Extension**
   - Install "MySQL" extension by Jun Han in VS Code

2. **Add Connection**
   - Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
   - Type "MySQL: Add Connection"
   - Enter connection details:
     - Host: `mysql-20c9b725-theeoneeyeddragon-a8dc.f.aivencloud.com`
     - Port: `10456`
     - User: `avnadmin`
     - Password: (Get from `.env` file or Aiven console)
     - Database: `defaultdb`
     - SSL: Enable

3. **Connect**
   - Right-click connection → "Connect"

## Quick Connection Script

I've created a helper script for quick command-line access:

```bash
./scripts/connect-aiven-mysql.sh
```

## Download SSL Certificate

For enhanced security, download the CA certificate:

1. Go to Aiven Console: https://console.aiven.io/
2. Open your MySQL service
3. Go to **Overview** tab
4. Scroll to **Connection information**
5. Click **"Download CA certificate"**
6. Save as `ca.pem` in your project directory

## Troubleshooting

### Connection Timeout
- Verify service is "Running" in Aiven console
- Check firewall/IP whitelist settings
- Ensure port `10456` is correct

### SSL Certificate Error
- Ensure SSL is enabled
- Download fresh CA certificate from Aiven
- Verify certificate path is correct

### Authentication Failed
- Double-check username: `avnadmin`
- Verify password is correct (no extra spaces)
- Try resetting password in Aiven console if needed

### "Access Denied" Error
- Check if your IP is whitelisted in Aiven
- Verify database name: `defaultdb`
- Ensure user has proper permissions

## Quick Test Commands

Once connected, try these:

```sql
-- List all tables
SHOW TABLES;

-- Check table structure
DESCRIBE facilities;
DESCRIBE tickets;
DESCRIBE server_assets;

-- Count records
SELECT COUNT(*) as total_facilities FROM facilities;
SELECT COUNT(*) as total_tickets FROM tickets;

-- View sample data
SELECT * FROM facilities LIMIT 5;
SELECT * FROM tickets LIMIT 5;
```

---

**Need Help?**
- Aiven Console: https://console.aiven.io/
- Aiven Docs: https://docs.aiven.io/docs/products/mysql
