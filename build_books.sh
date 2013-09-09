#!/bin/bash

function cleanHTMLDir()
{
	CLEAN_DIR=$1

	if [ -d /var/www/html/${CLEAN_DIR} ] || [ -e /var/www/html/${CLEAN_DIR} ]
	then
		rm -rf /var/www/html/${CLEAN_DIR}
	fi

}

function backupAndCleanHTMLDir()
{
	CLEAN_DIR=$1

	if [ -d /var/www/html/${CLEAN_DIR} ] || [ -e /var/www/html/${CLEAN_DIR} ]
	then
		if [ -d /var/www/html/backup/${CLEAN_DIR} ] || [ -e /var/www/html/backup/${CLEAN_DIR} ]
		then
			rm -rf /var/www/html/backup/${CLEAN_DIR}
		fi

		mkdir -p /var/www/html/backup/${CLEAN_DIR}
		cp -r /var/www/html/${CLEAN_DIR} /var/www/html/backup/${CLEAN_DIR}
		rm -rf /var/www/html/${CLEAN_DIR}
	fi

}

TMP_DIR=/tmp/buildbooks
BOOKNAME=Book
EXPECTED_ARGS=2

if [ "$#" -lt ${EXPECTED_ARGS} ]
then
	echo ERROR! Expected more arguments.
	exit 1
fi

# Get the suffix on the directory
DIR_SUFFIX=$1
shift

while (( "$#" ))
do
	IFS='=' read -ra ADDR <<< "$1"

  # Extract the language, Common Content language and CSP id
  # from the command line argument
	BUILD_LANG=${ADDR[0]}
	PUBLICAN_LANG=${ADDR[1]}
	CSPID=${ADDR[2]}

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

	date > build.log

		echo "csprocessor build --lang ${BUILD_LANG} --flatten --editor-links --show-report --target-lang ${PUBLICAN_LANG} --output ${BOOKNAME}.zip ${CSPID} >> build.log"
		csprocessor build --lang ${BUILD_LANG} --flatten --editor-links --show-report --target-lang ${PUBLICAN_LANG} --output ${BOOKNAME}.zip ${CSPID} >> build.log

		# If the csp build failed then continue to the next item
		if [ $? != 0 ]
		then
			cleanHTMLDir ${BUILD_LANG}/${CSPID}

			mkdir -p /var/www/html/${BUILD_LANG}/${CSPID}
			cp build.log /var/www/html/${BUILD_LANG}/${CSPID}

			continue
		fi		

		unzip ${BOOKNAME}.zip

		# The zip file will be extracted to a directory name that 
		# refelcts the name of the book. We don't know this name,
		# but we can loop over the subdirectories and then break
		# once we have processed the first directory.
		for dir in ./*/
		do

			# Enter the extracted book directory
			pushd ${dir}

				echo "publican build --formats=html-single,pdf --langs=${PUBLICAN_LANG} &> publican.log"
				publican build --formats=html-single,pdf --langs=${PUBLICAN_LANG} &> publican.log

				# If the publican build fails then put the log in the html dir
				if [ $? != 0 ]
				then
					mkdir -p /var/www/html/${BUILD_LANG}/${CSPID}
					cp publican.log /var/www/html/${BUILD_LANG}/${CSPID}

					# Leave the current directory and continue to the next spec
					popd
					break
				fi

				backupAndCleanHTMLDir ${BUILD_LANG}/${CSPID}
				mkdir -p /var/www/html/${BUILD_LANG}/${CSPID}
				
				cp -R tmp/${PUBLICAN_LANG}/html-single/* /var/www/html/${BUILD_LANG}/${CSPID}
	 			cp -R tmp/${PUBLICAN_LANG}/pdf/* /var/www/html/${BUILD_LANG}/${CSPID}

				cp publican.log /var/www/html/${BUILD_LANG}/${CSPID}
			popd
			
			# we only want to process one directory
			break

		done

		cp build.log /var/www/html/${BUILD_LANG}/${CSPID}
	popd
done
