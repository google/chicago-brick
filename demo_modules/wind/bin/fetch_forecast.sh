#!/bin/bash

# Requires grib2json which is built on java. You can install a CLI-wrapper wth
# npm, but you must have a JRE installed. This assumes that java is available on
# your path.
#
# $ npm install -g weacast-grib2json
#

# Portable secure tmp directory:
# https://unix.stackexchange.com/questions/30091/fix-or-alternative-for-mktemp-in-os-x
TMPDIR=`mktemp -d 2>/dev/null || mktemp -d -t 'mytmpdir'`

if [[ -d $1 ]];then
  OUT=$1
else
  OUT="../../../demo_assets"
fi

echo "Downloading forecast data to: $OUT"

# Forecasts are released every 6 hours UTC time. Start with 6 hours ago so we
# can be sure it is already available.
if date --version >/dev/null 2>&1 ; then
  # GNU date on linux.
  DATE=`date -u -d '-6 hours' +%Y%m%d`
  HOUR=`date -u -d '-6 hours' +%H`
else
  # BSD date on mac.
  DATE=`date -u -v-6H +%Y%m%d`
  HOUR=`date -u -v-6H +%H`
fi

# Reduce to the nearest 6 our block with integer division.
HOUR=`expr \( ${HOUR} / 6 \) \* 6`

# Pad to 2 digits.
HOUR=`printf "%02d" ${HOUR}`

# Fetch the forecast.
curl "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_1p00.pl?file=gfs.t${HOUR}z.pgrb2.1p00.f000&lev_10_m_above_ground=on&var_UGRD=on&var_VGRD=on&dir=%2Fgfs.${DATE}%2F${HOUR}%2Fatmos" -o $TMPDIR/gfs.t${HOUR}z.pgrb2.1p00.f000

PREFIX=`npm config get prefix`

# Convert to json.
java -Xmx512M -jar $PREFIX/lib/node_modules/weacast-grib2json/bin/grib2json.jar -d -n \
  -o "$TMPDIR/wind-current-surface-level-gfs-1.0.json" \
  $TMPDIR/gfs.t${HOUR}z.pgrb2.1p00.f000

# Make it available.
cp $TMPDIR/wind-current-surface-level-gfs-1.0.json $OUT

# Remove tmp dir.
rm -rf $TMPDIR
