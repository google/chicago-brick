#!/bin/bash

# Requires ogr2ogr part of the gdal framework to be available in PATH.
# For mac, install 2.1 complete from http://www.kyngchaos.com/software:frameworks
# Add /Library/Frameworks/GDAL.framework/Versions/Current/Programs to
# your $PATH.
# On ubuntu:  apt-get install gdal-bin

TMPDIR=`mktemp -d 2>/dev/null || mktemp -d -t 'mytmpdir'`

if [[ -d $1 ]];then
  OUT=$1
else
  OUT="../../../demo_assets"
fi

echo "Downloading map data to: $OUT"

# Get the map data
curl -o "$TMPDIR/ne_50m_admin_0_countries.zip" \
  'http://naciscdn.org/naturalearth/50m/cultural/ne_50m_admin_0_countries.zip'

curl -o "$TMPDIR/ne_50m_lakes.zip" \
  'http://naciscdn.org/naturalearth/50m/physical/ne_50m_lakes.zip'

pushd $TMPDIR
unzip ne_50m_admin_0_countries.zip
unzip ne_50m_lakes.zip
popd

# Extract relavent features.
ogr2ogr \
  -f GeoJSON \
  -where "continent = 'North America' OR continent = 'South America'" \
  $TMPDIR/americas.json \
  $TMPDIR/ne_50m_admin_0_countries.shp

ogr2ogr \
  -f GeoJSON \
  $TMPDIR/lakes.json \
  $TMPDIR/ne_50m_lakes.shp

# Copy to assets.
cp $TMPDIR/americas.json $OUT
cp $TMPDIR/lakes.json $OUT

# Remove tmp dir.
rm -rf $TMPDIR
