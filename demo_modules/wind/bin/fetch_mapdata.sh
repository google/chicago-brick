#!/bin/bash

# Replace this with a proper system tmp directory.
mkdir -p ./tmp

# Get the map data
curl -o 'tmp/ne_50m_admin_0_countries.zip' \
  'http://naciscdn.org/naturalearth/50m/cultural/ne_50m_admin_0_countries.zip'

pushd tmp
unzip ne_50m_admin_0_countries.zip
popd

# Extract relavent features.
# Requires ogr2ogr part of the gdal framework.
# For mac, install 2.1 complete from http://www.kyngchaos.com/software:frameworks
/Library/Frameworks/GDAL.framework/Versions/Current/Programs/ogr2ogr \
  -f GeoJSON \
  -where "continent = 'North America' OR continent = 'South America'" \
  tmp/americas.json \
  tmp/ne_50m_admin_0_countries.shp

# Copy to assets.
cp tmp/americas.json ../../../demo_assets
