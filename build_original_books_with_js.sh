#!/bin/bash

#  Copyright 2011-2014 Red Hat, Inc
#
#  This file is part of PressGang CCMS.
#
#  PressGang CCMS is free software: you can redistribute it and/or modify
#  it under the terms of the GNU Lesser General Public License as published by
#  the Free Software Foundation, either version 3 of the License, or
#  (at your option) any later version.
#
#  PressGang CCMS is distributed in the hope that it will be useful,
#  but WITHOUT ANY WARRANTY; without even the implied warranty of
#  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#  GNU Lesser General Public License for more details.
#
#  You should have received a copy of the GNU Lesser General Public License
#  along with PressGang CCMS.  If not, see <http://www.gnu.org/licenses/>.

# NOTE: This is just an interim helper script until the build script is moved into the node js app.

# The Apache root html directory
APACHE_HTML_DIR=/var/www/html
DIR_SUFFIX=$1

# Get the directory hosting the script. This is important if the script is called from
# another working directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

cd ${DIR}

# Load the pressgang website url from the config
PRESSGANG_WEBSITE_URL=`grep -Po "(?<=PRESSGANG_WEBSITE_JS_URL: \").*(?=\")" src/config.js`

# Build the templates
CSS_TEMPLATE="    <link href='/lib/docbuilder-overlay/css/pressgang.css' rel='stylesheet'>\n\
    <link href='/lib/docbuilder-overlay/css/style.css' rel='stylesheet'>\n\
    <link href='/lib/bootstrap/css/bootstrap.min.css' rel='stylesheet'>\n"

JS_TEMPLATE="    <script type='application/javascript' src='/config.js'></script>\n\
    <script type='application/javascript' src='/lib/jquery/jquery.min.js'></script>\n\
    <script type='application/javascript' src='/lib/moment/moment-with-locales.min.js'></script>\n\
    <script type='application/javascript' src='/lib/bootstrap/js/bootstrap.min.js'></script>\n\
    <script type='application/javascript' src='/lib/bootbox/bootbox.js'></script>\n\
    <script type='application/javascript' src='/lib/raphael/raphael-min.js'></script>\n\
    <script type='application/javascript' src='/lib/raphael/g.pie-min.js'></script>\n\
    <script type='application/javascript' src='/lib/typo/typo.js'></script>\n\
    <script type='application/javascript' src='/lib/async/async.js'></script>\n\
    <script type='application/javascript' src='/lib/docbuilder-overlay/javascript/overlay.js'></script>\n\
    <script type='application/javascript' src='/lib/docbuilder-overlay/javascript/pressgang_websites.js'></script>\n\
    <script type='application/javascript' src='$PRESSGANG_WEBSITE_URL' async></script>\n"

# Fix up the templates so they can be used in sed
CSS_TEMPLATE="${CSS_TEMPLATE//\//\\/}"
JS_TEMPLATE="${JS_TEMPLATE//\//\\/}"

shift

# Loop through each argument and add the js to the output
while (( "$#" ))
do
    # Extract the content spec id from the args
    CSPID=$1

    # Shift the arguments down
    shift

    # Perform the original build
    ./build_original_books.sh ${DIR_SUFFIX} ${CSPID}

    # Check if the html file exists and if it does add the css and javascript files
    if [ -e "/var/www/html/${CSPID}/index.html" ]; then
        echo "Adding content to /var/www/html/${CSPID}/index.html"

        # Add the css
        sed "s/<head>/<head>\\n$CSS_TEMPLATE/" -i /var/www/html/${CSPID}/index.html

        # Add the js
        sed "s/<\/body><\/html>/<script>var SPEC_ID = ${CSPID};<\/script>$JS_TEMPLATE\\n<\/body><\/html>/" -i /var/www/html/${CSPID}/index.html
    fi

    # Check if the remarks html file exists and if it does add the css and javascript files
    if [ -e "/var/www/html/${CSPID}/remarks/index.html" ]; then
        echo "Adding content to /var/www/html/${CSPID}/remarks/index.html"

        # Add the css
        sed "s/<head>/<head>\\n$CSS_TEMPLATE/" -i /var/www/html/${CSPID}/remarks/index.html

        # Add the js
        sed "s/<\/body><\/html>/<script>var SPEC_ID = ${CSPID};<\/script>\\n$JS_TEMPLATE<\/body><\/html>/" -i /var/www/html/${CSPID}/remarks/index.html
    fi
done