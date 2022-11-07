source "./fetch.sh"

CURRENT_YEAR=$(date +%Y)
CURRENT_MONTH=$(date +%m)

NULL_FILESIZE=2

for (( YEAR = 1998; YEAR <= $CURRENT_YEAR; YEAR++ )) do
    for (( MONTH = 1; MONTH <= 12; MONTH++ )) do
        # fetch JSON
        fetch $YEAR $MONTH

        # bail
        if [[ $YEAR == $CURRENT_YEAR && $ZERO_MONTH == $CURRENT_MONTH ]]
        then
            echo "BAIL"
            break
        fi
    done
done
