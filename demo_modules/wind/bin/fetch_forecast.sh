#!/bin/bash

# Requires grib2json which is built on java. You can install a CLI-wrapper wth
# npm, but you must have a JRE installed.  $JAVA_HOME must be set as an
# environment variable.
#
# $ npm install -g weacast-grib2json
#

# Replace this with a proper system tmp directory.
mkdir -p ./tmp

DATE=`date +%Y%m%d`

curl "http://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_1p00.pl?file=gfs.t00z.pgrb2.1p00.f000&lev_10_m_above_ground=on&var_UGRD=on&var_VGRD=on&leftlon=0&rightlon=360&toplat=90&bottomlat=-90&dir=%2Fgfs.${DATE}00" -o tmp/gfs.t00z.pgrb2.1p00.f000

/usr/local/lib/node_modules/weacast-grib2json/bin/grib2json -d -n \
  -o 'tmp/current-wind-surface-level-gfs-1.0.json' \
  tmp/gfs.t00z.pgrb2.1p00.f000

cp tmp/current-wind-surface-level-gfs-1.0.json ../../../demo_assets
