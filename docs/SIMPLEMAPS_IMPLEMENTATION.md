# SimpleMaps Implementation Guide for Kenya Map

## Overview
This guide explains how to properly implement SimpleMaps data for the Kenya county map visualization.

## Current Issue
The map is showing "Could not load map data" because the GeoJSON URL is not accessible or the data format doesn't match.

## Solution Options

### Option 1: Use SimpleMaps Shapefiles (Recommended)

1. **Download from SimpleMaps:**
   - Visit: https://simplemaps.com/gis/country/ke#admin1
   - Download the Kenya administrative level 1 (ADM1) shapefiles for counties
   - You'll get files like: `ke_adm1.shp`, `ke_adm1.shx`, `ke_adm1.dbf`, etc.

2. **Convert Shapefiles to GeoJSON:**
   
   **Method A: Using Online Converter (Easiest)**
   - Go to https://mapshaper.org/
   - Drag and drop your `.shp` file (or all shapefile components)
   - Click "Export" → Select "GeoJSON"
   - Download the converted file

   **Method B: Using QGIS (Desktop Software)**
   - Install QGIS (free): https://qgis.org/
   - Open the shapefile in QGIS
   - Right-click layer → Export → Save Features As
   - Choose GeoJSON format
   - Save as `kenya-counties.geojson`

   **Method C: Using Command Line (GDAL)**
   ```bash
   ogr2ogr -f GeoJSON kenya-counties.geojson ke_adm1.shp
   ```

3. **Add to Project:**
   - Create directory: `public/data/`
   - Place `kenya-counties.geojson` in `public/data/`
   - The code will automatically use it as a fallback

### Option 2: Use Alternative Public GeoJSON Sources

The code tries multiple sources automatically:
- GitHub repositories with Kenya GeoJSON
- Local file in `/public/data/kenya-counties.geojson`

### Option 3: Use TopoJSON (Smaller File Size)

If you want a smaller file size:
1. Convert shapefile to TopoJSON using:
   ```bash
   topojson -o kenya-counties.json -- ke_adm1.shp
   ```
2. Update the code to use TopoJSON format
3. Place in `public/data/kenya-counties.json`

## Implementation Steps

1. **Download SimpleMaps Shapefiles:**
   - Go to https://simplemaps.com/gis/country/ke#admin1
   - Download the county-level shapefiles

2. **Convert to GeoJSON:**
   - Use mapshaper.org (easiest) or QGIS
   - Ensure the output is valid GeoJSON

3. **Add to Project:**
   ```bash
   mkdir -p public/data
   # Copy your converted kenya-counties.geojson here
   ```

4. **Verify County Names:**
   - Check that county names in GeoJSON match your data:
     - Kakamega
     - Vihiga
     - Nyamira
     - Kisumu
   - Update `COUNTY_NAME_MAP` in `components/kenya-map.tsx` if names differ

5. **Test:**
   - The map should automatically load the local file
   - Counties should be colored based on server distribution

## County Name Matching

The GeoJSON might use different county names. Common variations:
- "Kakamega County" vs "Kakamega"
- "Vihiga County" vs "Vihiga"
- etc.

Update the `getCountyData` function to handle name variations if needed.

## File Structure

```
project-root/
├── public/
│   └── data/
│       └── kenya-counties.geojson  ← Place converted file here
├── components/
│   └── kenya-map.tsx  ← Map component
└── docs/
    └── SIMPLEMAPS_IMPLEMENTATION.md  ← This file
```

## Troubleshooting

1. **"Could not load map data" error:**
   - Ensure GeoJSON file is in `public/data/kenya-counties.geojson`
   - Check browser console for CORS errors
   - Verify GeoJSON is valid (use https://geojson.io/)

2. **Counties not showing:**
   - Check county name matching in `getCountyData` function
   - Verify GeoJSON has the correct county names
   - Check browser console for errors

3. **Map not interactive:**
   - Ensure `react-simple-maps` is installed: `npm install react-simple-maps`
   - Check that GeoJSON format is correct (FeatureCollection)

## Next Steps

1. Download shapefiles from SimpleMaps
2. Convert to GeoJSON using mapshaper.org
3. Place in `public/data/kenya-counties.geojson`
4. Test the map - it should work automatically!
