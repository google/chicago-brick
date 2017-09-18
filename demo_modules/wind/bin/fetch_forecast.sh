#!/bin/bash

# Requires grib2json which is built on java. You can install a CLI-wrapper wth
# npm, but you must have a JRE installed.  $JAVA_HOME must be set as an
# environment variable.
#
# $ npm install -g weacast-grib2json
#

# Replace this with a proper system tmp directory.
mkdir -p ./tmp

# Forecasts are released every 6 hours UTC time. Start with 6 hours ago so we
# can be sure it is already available.
DATE=`date -u -v-6H +%Y%m%d`
HOUR=`date -u -v-6H +%H`

# Reduce to the nearest 6 our block with integer division.
HOUR=`expr \( ${HOUR} / 6 \) \* 6`

# Pad to 2 digits.
HOUR=`printf "%02d" ${HOUR}`

# Fetch the forecast.
curl "http://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_1p00.pl?file=gfs.t${HOUR}z.pgrb2.1p00.f000&lev_10_m_above_ground=on&var_UGRD=on&var_VGRD=on&leftlon=0&rightlon=360&toplat=90&bottomlat=-90&dir=%2Fgfs.${DATE}${HOUR}" -o tmp/gfs.t${HOUR}z.pgrb2.1p00.f000

# Convert to json.
/usr/local/lib/node_modules/weacast-grib2json/bin/grib2json -d -n \
  -o 'tmp/current-wind-surface-level-gfs-1.0.json' \
  tmp/gfs.t${HOUR}z.pgrb2.1p00.f000

# Make it available.
cp tmp/current-wind-surface-level-gfs-1.0.json ../../../demo_assets
