#!/bin/bash

# Aiven MySQL Setup Helper Script
# This script helps you configure your application to use Aiven MySQL

echo "=========================================="
echo "Aiven MySQL Database Setup Helper"
echo "=========================================="
echo ""

# Check if .env file exists
if [ -f .env ]; then
    echo "⚠️  .env file already exists"
    read -p "Do you want to backup the existing .env file? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
        echo "✅ Backup created: .env.backup.$(date +%Y%m%d_%H%M%S)"
    fi
else
    echo "📝 Creating new .env file..."
fi

echo ""
echo "Please provide your Aiven MySQL connection details:"
echo ""

# Get connection details
read -p "Aiven MySQL Host (e.g., your-service.a.aivencloud.com): " AIVEN_HOST
read -p "Aiven MySQL Port (usually 25060): " AIVEN_PORT
read -p "Aiven MySQL Username (usually avnadmin): " AIVEN_USER
read -s -p "Aiven MySQL Password: " AIVEN_PASSWORD
echo ""
read -p "Database name (usually defaultdb): " AIVEN_DB
read -p "Use SSL? (y/n, recommended: y): " USE_SSL

# Set defaults
AIVEN_PORT=${AIVEN_PORT:-25060}
AIVEN_USER=${AIVEN_USER:-avnadmin}
AIVEN_DB=${AIVEN_DB:-defaultdb}
USE_SSL=${USE_SSL:-y}

# Build connection string
if [[ $USE_SSL =~ ^[Yy]$ ]]; then
    DATABASE_URL="mysql://${AIVEN_USER}:${AIVEN_PASSWORD}@${AIVEN_HOST}:${AIVEN_PORT}/${AIVEN_DB}?ssl-mode=REQUIRED"
else
    DATABASE_URL="mysql://${AIVEN_USER}:${AIVEN_PASSWORD}@${AIVEN_HOST}:${AIVEN_PORT}/${AIVEN_DB}"
fi

# Write to .env file
cat > .env << EOF
# Aiven MySQL Database Connection
DATABASE_URL="${DATABASE_URL}"
EOF

echo ""
echo "✅ .env file updated with Aiven connection string"
echo ""

# Ask if user wants to test connection
read -p "Do you want to test the connection now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "Testing connection..."
    echo ""
    
    # Check if Prisma is installed
    if ! command -v npx &> /dev/null; then
        echo "❌ npx not found. Please install Node.js and npm first."
        exit 1
    fi
    
    # Generate Prisma client
    echo "📦 Generating Prisma client..."
    npx prisma generate
    
    if [ $? -eq 0 ]; then
        echo "✅ Prisma client generated successfully"
    else
        echo "❌ Failed to generate Prisma client"
        exit 1
    fi
    
    # Test connection
    echo ""
    echo "🔌 Testing database connection..."
    npx prisma db pull --force 2>&1 | head -20
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Connection successful!"
        echo ""
        read -p "Do you want to push the schema to Aiven now? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo ""
            echo "📤 Pushing schema to Aiven..."
            npx prisma db push
            
            if [ $? -eq 0 ]; then
                echo ""
                echo "✅ Schema pushed successfully!"
                echo ""
                echo "🎉 Setup complete! Your application is now connected to Aiven MySQL."
            else
                echo ""
                echo "❌ Failed to push schema. Please check the error messages above."
            fi
        fi
    else
        echo ""
        echo "❌ Connection failed. Please check:"
        echo "   1. Your Aiven service is running"
        echo "   2. Host, port, username, and password are correct"
        echo "   3. Your IP is whitelisted (if IP restrictions are enabled)"
        echo "   4. SSL settings are correct"
    fi
fi

echo ""
echo "=========================================="
echo "Next Steps:"
echo "=========================================="
echo "1. Review your .env file"
echo "2. Run: npx prisma generate"
echo "3. Run: npx prisma db push"
echo "4. Start your app: npm run dev"
echo ""
echo "For more details, see AIVEN_SETUP.md"
echo ""
