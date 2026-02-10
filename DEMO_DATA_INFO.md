# Demo Data Information

## What Was Added

Demo facility data has been added to the database for testing purposes:

### NDWH System
- **Kakamega**: 8 master facilities, 4 reported (50% reporting)
- **Vihiga**: 7 master facilities, 4 reported (57% reporting)
- **Nyamira**: 7 master facilities, 4 reported (57% reporting)
- **Kisumu**: 8 master facilities, 4 reported (50% reporting)

### CBS System
- **Kakamega**: 6 master facilities, 3 reported (50% reporting)
- **Vihiga**: 4 master facilities, 2 reported (50% reporting)
- **Nyamira**: 4 master facilities, 2 reported (50% reporting)
- **Kisumu**: 4 master facilities, 2 reported (50% reporting)

## Sample Facilities Added

### Kakamega (NDWH)
1. Kakamega County Referral Hospital
2. St. Mary's Hospital Mumias
3. Kakamega General Hospital
4. Butere Sub-County Hospital
5. Shinyalu Health Centre
6. Malava Sub-County Hospital
7. Matungu Health Centre
8. Lugari Sub-County Hospital

### Kisumu (NDWH)
1. Jaramogi Oginga Odinga Teaching and Referral Hospital
2. Kisumu County Hospital
3. Ahero Sub-County Hospital
4. Kombewa Sub-County Hospital
5. Muhoroni Sub-County Hospital
6. Nyakach Health Centre
7. Seme Sub-County Hospital
8. Kisumu East Health Centre

## Testing the Dynamic Features

You can now test:

1. **View Dashboard**: See the reporting status with charts
2. **Add Facilities**: Go to Facility Manager and add new facilities
3. **Remove Facilities**: Delete facilities from the master list
4. **Update Reports**: Add reported facilities and see missing facilities update
5. **Real-time Updates**: Changes reflect immediately in the dashboard

## To Add More Demo Data

Run the script again:
```bash
node scripts/add-demo-data.js
```

Note: The script uses `skipDuplicates: true`, so it won't create duplicates if you run it multiple times.

## To Clear All Data

If you want to start fresh:
```sql
mysql -uroot -ptest facility_dashboard -e "TRUNCATE TABLE facilities;"
```

Then run the demo data script again.
