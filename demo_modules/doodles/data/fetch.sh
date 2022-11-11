DATA_PATH="raw"
mkdir  -p $DATA_PATH

NULL_FILESIZE=2

fetch() {
    YEAR=$1
    MONTH=$2
    FORCE=${3:-false}

    ZERO_MONTH=$(printf %02d $(( 10#$MONTH))) # zero padding

    URL="https://www.google.com/doodles/json/$YEAR/$ZERO_MONTH?full=1"
    FILEPATH="$DATA_PATH/$YEAR-$ZERO_MONTH.json"

    if [[ $FORCE != true ]]
    then
        if [[ -f "$FILEPATH" ]]
        then
            FILESIZE=$(wc -c < "$FILEPATH")
            if [[ $FILESIZE -eq $NULL_FILESIZE ]]
            then
                echo "NULL: $FILEPATH"
            else
                echo "SKIP: $FILEPATH"
            fi

            return
        fi
    fi

    echo "FETCH: $FILEPATH"

    wget $URL -O "$FILEPATH" -q --show-progress
}
