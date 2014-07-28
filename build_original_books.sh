#!/bin/bash

#  Copyright 2011-2014 Red Hat
#
#  This file is part of PresGang CCMS.
#
#  PresGang CCMS is free software: you can redistribute it and/or modify
#  it under the terms of the GNU Lesser General Public License as published by
#  the Free Software Foundation, either version 3 of the License, or
#  (at your option) any later version.
#
#  PresGang CCMS is distributed in the hope that it will be useful,
#  but WITHOUT ANY WARRANTY; without even the implied warranty of
#  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#  GNU Lesser General Public License for more details.
#
#  You should have received a copy of the GNU Lesser General Public License
#  along with PresGang CCMS.  If not, see <http://www.gnu.org/licenses/>.

function cleanHTMLDir()
{
    CLEAN_DIR=$1

    if [ -d /var/www/html/${CLEAN_DIR} ] || [ -e /var/www/html/${CLEAN_DIR} ]
    then
        rm -rf /var/www/html/${CLEAN_DIR}
    fi
}

TMP_DIR=/tmp/buildbooks
BOOKNAME=Book
EXPECTED_ARGS=2
# The Apache root html directory
APACHE_HTML_DIR=/var/www/html
# The directory that holds the Publican ZIP files
PUBLICAN_BOOK_ZIPS=/books
# The complete directory that holds the Publican ZIP files
PUBLICAN_BOOK_ZIPS_COMPLETE=${APACHE_HTML_DIR}${PUBLICAN_BOOK_ZIPS}

if [ "$#" -lt ${EXPECTED_ARGS} ]
then
  echo ERROR! Expected more arguments.
	exit 1
fi

# Get the suffix on the directory
DIR_SUFFIX=$1
LOCK_FILE=${TMP_DIR}${DIR_SUFFIX}.lock

# echo ${LOCK_FILE}

shift

# Check and create a lock file to make sure builds don't overlap
if [ -f ${LOCK_FILE} ]
then
	date >> build_original_books_error.log
	echo "ERROR! ${LOCK_FILE} exists, consider increasing the time between builds." >> build_original_books_error.log
	exit 1
else
	touch ${LOCK_FILE}
fi

while (( "$#" ))
do
    # Extract the language and CSP id from the
    # command line argument
    CSPID=$1

    # Shift the arguments down
    shift

    # Start with a clean temp dir for every build
    if [ -d ${TMP_DIR}${DIR_SUFFIX} ]
    then
        rm -rf ${TMP_DIR}${DIR_SUFFIX}
    fi

    mkdir ${TMP_DIR}${DIR_SUFFIX}

    # Enter the temp directory
    pushd ${TMP_DIR}${DIR_SUFFIX}

        # Build the book as HTML-SINGLE with no overrides
        date > build.log

        echo "csprocessor build --flatten --editor-links  --skip-bug-link-validation --output ${BOOKNAME}.zip ${CSPID} >> build.log"
        csprocessor build --flatten --editor-links --skip-bug-link-validation --output ${BOOKNAME}.zip ${CSPID} >> build.log

        CSP_STATUS=$?

        cleanHTMLDir ${CSPID}
        mkdir /var/www/html/${CSPID}
        cp build.log /var/www/html/${CSPID}

        # If the csp build failed then continue to the next item
        if [ $CSP_STATUS == 0 ]
        then
            unzip ${BOOKNAME}.zip

            # The zip file will be extracted to a directory name that
            # refelcts the name of the book. We don't know this name,
            # but we can loop over the subdirectories and then break
            # once we have processed the first directory.
            for dir in ./*/
            do

                # Enter the extracted book directory
                pushd ${dir}

                    # Clone the publican.cfg for the remark builds
                    cp publican.cfg publican-remarks.cfg

                    # Add the extra options for the html and remark builds
                    echo -e "\nchunk_first: 1" >> publican.cfg
                    echo -e "\nshow_remarks: 1" >> publican-remarks.cfg

                    # Do the original publican build
                    echo 'publican build --formats=html-single,html --langs=en-US  &> publican.log'
                    publican build --formats=html-single,html --langs=en-US  &> publican.log

                    PUBLICAN_STATUS=$?

                    cp -R tmp/en-US/html-single/* /var/www/html/${CSPID}
                    cp publican.log /var/www/html/${CSPID}

                    # Copy the html to its own directory
                    cleanHTMLDir ${CSPID}/html
                    mkdir /var/www/html/${CSPID}/html

                    cp -R tmp/en-US/html/* /var/www/html/${CSPID}/html
                    cp publican.log /var/www/html/${CSPID}/html

                    # don't bother with the remark if the html-single failed
                    if [ $PUBLICAN_STATUS == 0 ] && [ $CSP_STATUS == 0 ]
                    then

                        # Clean up
                        rm -rf tmp
                        rm publican.log

                        # Do the remarks build
                        echo 'publican build --formats=html-single --langs=en-US --config=publican-remarks.cfg &> publican.log'
                        publican build --formats=html-single --langs=en-US --config=publican-remarks.cfg &> publican.log

                        cleanHTMLDir ${CSPID}/remarks
                        mkdir -p /var/www/html/${CSPID}/remarks

                        cp -R tmp/en-US/html-single/* /var/www/html/${CSPID}/remarks
                        cp publican.log /var/www/html/${CSPID}/remarks

                        # Build the publican zip file without editor links
                        DATE_MARKER=$(date '+%Y-%m-%dT%k:%M:%S.000%z')
                        BOOK_FILE_NAME="${PUBLICAN_BOOK_ZIPS_COMPLETE}/${CSPID} ${DATE_MARKER}.zip"

                        if [ -f "${BOOK_FILE_NAME}" ]
                        then
                            rm -rf "${BOOK_FILE_NAME}"
                        fi

                        echo "csprocessor build --output "${BOOK_FILE_NAME}" ${CSPID} >> build.log"
                        csprocessor build --output "${BOOK_FILE_NAME}" ${CSPID} >> build.log

                    fi
                popd

                # we only want to process one directory
                break

            done

        fi

    popd

done

# remove the lock file
rm -f ${LOCK_FILE}
