#!/bin/bash

# Quick connection script for Aiven MySQL
# Usage: ./scripts/connect-aiven-mysql.sh

# Load password from environment variable or .env file
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

AIVEN_HOST="mysql-20c9b725-theeoneeyeddragon-a8dc.f.aivencloud.com"
AIVEN_PORT="10456"
AIVEN_USER="avnadmin"
AIVEN_DB="defaultdb"
AIVEN_PASSWORD="${DATABASE_URL_PASSWORD:-${AIVEN_PASSWORD:-}}"

# Extract password from DATABASE_URL if set
if [ -n "$DATABASE_URL" ]; then
    # Extract password from connection string: mysql://user:password@host:port/db
    AIVEN_PASSWORD=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
fi

if [ -z "$AIVEN_PASSWORD" ]; then
    echo "❌ Error: Aiven password not found!"
    echo ""
    echo "Please set one of the following:"
    echo "  1. Set AIVEN_PASSWORD environment variable"
    echo "  2. Set DATABASE_URL environment variable"
    echo "  3. Add AIVEN_PASSWORD to .env file"
    echo ""
    echo "Example .env entry:"
    echo "  AIVEN_PASSWORD=your_password_here"
    exit 1
fi

echo "=========================================="
echo "Connecting to Aiven MySQL..."
echo "=========================================="
echo ""
echo "Host: $AIVEN_HOST"
echo "Port: $AIVEN_PORT"
echo "Database: $AIVEN_DB"
echo "User: $AIVEN_USER"
echo ""

# Check if MySQL client is installed
if ! command -v mysql &> /dev/null; then
    echo "❌ MySQL client not found!"
    echo ""
    echo "Install MySQL client:"
    echo "  Ubuntu/Debian: sudo apt-get install mysql-client"
    echo "  macOS: brew install mysql-client"
    echo "  Windows: Download from https://dev.mysql.com/downloads/mysql/"
    exit 1
fi

# Check if SSL certificate exists
if [ -f "ca.pem" ]; then
    echo "✅ SSL certificate found (ca.pem)"
    echo "Connecting with SSL certificate..."
    echo ""
    mysql -h "$AIVEN_HOST" \
          -P "$AIVEN_PORT" \
          -u "$AIVEN_USER" \
          -p"$AIVEN_PASSWORD" \
          --ssl-mode=REQUIRED \
          --ssl-ca=ca.pem \
          "$AIVEN_DB"
else
    echo "⚠️  SSL certificate not found (ca.pem)"
    echo "Connecting with SSL (without certificate)..."
    echo ""
    echo "Tip: Download CA certificate from Aiven console for enhanced security"
    echo ""
    mysql -h "$AIVEN_HOST" \
          -P "$AIVEN_PORT" \
          -u "$AIVEN_USER" \
          -p"$AIVEN_PASSWORD" \
          --ssl-mode=REQUIRED \
          "$AIVEN_DB"
fi
