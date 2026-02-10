#!/bin/bash

# Database setup script for Facility Reporting Dashboard

echo "Setting up database for Facility Reporting Dashboard..."
echo ""

# Check if MySQL is accessible
echo "Checking MySQL connection..."
mysql -uroot -ptest -e "SELECT 1" > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "Error: Cannot connect to MySQL. Please ensure MySQL is running and credentials are correct."
    exit 1
fi

echo "MySQL connection successful!"
echo ""

# Create database
echo "Creating database 'facility_dashboard'..."
mysql -uroot -ptest -e "CREATE DATABASE IF NOT EXISTS facility_dashboard;" 2>&1
if [ $? -eq 0 ]; then
    echo "Database created successfully!"
else
    echo "Error creating database. It may already exist."
fi

echo ""
echo "Database setup complete!"
echo ""
echo "Next steps:"
echo "1. Create a .env file with: DATABASE_URL=\"mysql://root:test@localhost:3306/facility_dashboard?schema=public\""
echo "2. Run: npx prisma generate"
echo "3. Run: npx prisma db push"
echo ""
