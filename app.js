var fs = require('fs');
var set = require('collections/sorted-set.js');
var iterator = require("collections/iterator");
var $ = require("jquery");
var moment = require('moment');
var exec = require('child_process').exec;

/**
 * The REST server that the DocBuilder will connect to.
 * @type {string}
 */
var REST_SERVER = "http://topicindex-dev.ecs.eng.bne.redhat.com:8080/pressgang-ccms/rest";
/**
 * The file that holds the lat time a complete rebuild was completed.
 * @type {string}
 */
//var LAST_RUN_FILE = "/home/pressgang/.docbuilder/docbuilder2_lastrun";
var LAST_RUN_FILE = "/home/matthew/.docbuilder/docbuilder2_lastrun";
/**
 * The format of the date to be supplied to the REST query.
 * @type {string}
 */
var DATE_FORMAT = "YYYY-MM-ddThh:mm:ss.000Z";
/**
 * Thje maximum number of child processes to run at any given time.
 * @type {number}
 */
var MAX_PROCESSES = 16;
/**
 * The index file for the DocBuilder
 * @type {string}
 */
var INDEX_HTML = "/var/www/html/index.html";
/**
 * The web root dir.
 * @type {string}
 */
var APACHE_HTML_DIR="/var/www/html";
/**
 * The directory that holds the Publican ZIP files
 */
var PUBLICAN_BOOK_ZIPS= "/books";
/**
 *	The complete directory that holds the Publican ZIP files
 */
var PUBLICAN_BOOK_ZIPS_COMPLETE=APACHE_HTML_DIR + PUBLICAN_BOOK_ZIPS;

/**
 * true when the modified topics have been processed.
 * @type {boolean}
 */
var topicsProcessed = false;
/**
 * true when the modified specs have been processed
 * @type {boolean}
 */
var specsProcessed = false;
/**
 * The count of the number of child processes
 * @type {number}
 */
var childCount = 0;
/**
 * The string to be saved in the marker file when a rebuild is completed.
 * @type {string}
 */
var thisBuildTime = null;

var indexHtml = "";

/**
 * Called when the modified topics and specs have been found. Once both
 * functions have called this function, the process of actually building the
 * books will start.
 */
function buildBooks(updatedSpecs) {
	if (specsProcessed && topicsProcessed) {

		indexHtml = "<html>\
			<head>\
				<title>Docbuilder Index</title>\
				<link rel=\"stylesheet\" href=\"index.css\"/>\
				<script src=\"http://yui.yahooapis.com/3.10.0/build/yui/yui-min.js\"></script>\
				<script src=\"functions-1.1.js\" ></script>\
			</head>\
			<body onload=\"setLangSelectLanguage()\">\
				<div class=\"container\">\
					<div class=\"langBar\">Language:\
						<select id=\"lang\" class=\"langSelect\" onchange=\"changeLang(this)\">\
							<option selected value=\"\">English</option>\
							<option value=\"zh-Hans\">Chinese</option>\
							<option value=\"fr\">French</option>\
							<option value=\"de\">German</option>\
							<option value=\"ja\">Japanese</option>\
							<option value=\"pt-BR\">Portuguese</option>\
							<option value=\"es\">Spanish</option>\
						</select>\
					</div>\
					<div class=\"content\">\
						<div>\
							<img height=\"87\" src=\"pg.png\" width=\"879\">\
						</div>\
						<div style=\"margin-top:1em\">\
							<p>DocBuilder is a service that automatically rebuilds content specifications as they are created or edited.</p>\
							<p>Each content spec has three links: a link to the compiled book itself, a link to the build log, and a link to the publican log.</p>\
							<p>If a book could not be built, first check the build log. This log contains information that may indicate syntax errors in the content specification. You can also view this log to see when the document was last built.</p>\
							<p>If the build log has no errors, check the publican log. This may indicate some syntax errors in the XML.</p>\
							<p>The topics in each document include a \"Edit this topic\" link, which will take you to the topic in the CCMS.</p>\
							<p>To view the latest changes to a document, simply refresh the page.</p><p>Estimated Rebuild Time: ${REBUILD_TIME}</p>\
						</div>\
						<div></div>\
						<div>\
							<table>\
								<tr>\
									<td>\
										ID Filter\
									</td>\
									<td>\
										<input type=\"text\" id=\"idFilter\" onkeyup=\"save_filter()\">\
									</td>\
									<td>\
										Product Filter\
									</td>\
									<td>\
										<input type=\"text\" id=\"productFilter\" onkeyup=\"save_filter()\">\
									</td>\
									<td rowspan=\"2\">\
										<button onclick=\"reset_filter()\">Reset</button>\
									</td>\
								</tr>\
								<tr>\
									<td>\
										Version Filter\
									</td>\
									<td>\
										<input type=\"text\" id=\"versionFilter\" onkeyup=\"save_filter()\">\
									</td>\
									<td>\
										Title Filter\
									</td>\
									<td>\
										<input type=\"text\" id=\"titleFilter\" onkeyup=\"save_filter()\">\
									</td>\
								</tr>\
							</table> \
							</div>\
							<div></div>\
						</div>\
						</div>\
						<script>\
							// build the array that holds the details of the books \
							var data = [";

		for (var processIndex = 0, processCount = updatedSpecs.length; processIndex < processCount; ++processIndex) {
			var specDetails = updatedSpecs.get(processIndex);

			indexHtml += "{\
				idRaw: " + specDetails.id + ",\
				id: '<a href=\"http://skynet.usersys.redhat.com:8080/pressgang-ccms-ui/#ContentSpecFilteredResultsAndContentSpecView;query;contentSpecIds=" + specDetails.id + "\" target=\"_top\">" + specDetails.id + "</a>',\
					versionRaw: '${VERSION}', \
					version: '<a href=\"http://skynet.usersys.redhat.com:8080/pressgang-ccms-ui/#DocBuilderView;" + specDetails.id + "\" target=\"_top\">" + specDetails.version + "</a>',\
					productRaw: '" + specDetails.product + "',\
					product: '<a href=\"http://skynet.usersys.redhat.com:8080/pressgang-ccms-ui/#DocBuilderView;" + specDetails.id + "\" target=\"_top\">" + specDetails.product + "</a>',\
					titleRaw: '${TITLE}', title: '<a href=\"http://skynet.usersys.redhat.com:8080/pressgang-ccms-ui/#DocBuilderView;" + specDetails.id + "\"  target=\"_top\">" + specDetails.title + "</a>', \
					remarks: '<a href=\"" + specDetails.id + "/remarks\"><button>With Remarks</button></a>',\
					buildlog: '<a href=\"" + specDetails.id + "/build.log\"><button>Build Log</button></a>' ,\
					publicanbook: '<a href=\"" + PUBLICAN_BOOK_ZIPS + "/" + ESCAPED_PUBLICAN_BOOK_URL + "\"><button>Publican ZIP</button></a>',\
					publicanlog: '<a href=\"" + specDetails.id + "/publican.log\"><button>Publican Log</button></a>'\
			},";
		}

		indexHtml += " ];\
					rebuildTimeout = null;\
					productFilter.value = localStorage[\"productFilter\"] || \"\"; \
					titleFilter.value = localStorage[\"titleFilter\"] || \"\"; \
					versionFilter.value = localStorage[\"versionFilter\"] || \"\"; \
					idFilter.value = localStorage[\"idFilter\"] || \"\"; \
					save_filter = function() {\
						localStorage[\"productFilter\"] = productFilter.value;\
						localStorage[\"titleFilter\"] = titleFilter.value;\
						localStorage[\"versionFilter\"] = versionFilter.value;\
						localStorage[\"idFilter\"] = idFilter.value;\
						if (rebuildTimeout) {\
							window.clearTimeout(rebuildTimeout);\
							rebuildTimeout = null;\
						}\
						rebuildTimeout = setTimeout(function(){\
							build_table(data);\
							rebuildTimeout = null;\
						},1000);\
					}\
					reset_filter = function() {\
						localStorage[\"productFilter\"] = \"\";\
						localStorage[\"titleFilter\"] = \"\";\
						localStorage[\"versionFilter\"] = \"\";\
						localStorage[\"idFilter\"] = \"\";\
						productFilter.value = \"\";\
						titleFilter.value = \"\";\
						versionFilter.value = \"\";\
						idFilter.value = \"\";\
						if (rebuildTimeout) {\
							window.clearTimeout(rebuildTimeout);\
							rebuildTimeout = null;\
						}\
						build_table(data);\
					}\
					build_table(data);\
				</script>\
			</body>\
		</html>";


		for (var processIndex = 0, processCount = updatedSpecs.length < MAX_PROCESSES ? updatedSpecs.length : MAX_PROCESSES; processIndex < processCount; ++processIndex) {
			var specId = updatedSpecs.pop();
			++childCount;
			exec("echo " + specId, function(error, stdout, stderr) {
				--childCount;
				if (childCount < MAX_PROCESSES) {

					if (updatedSpecs.length != 0) {
						/*
						 	If there are still specs to be processed, then process them
						 */
						buildBooks(updatedSpecs);
					} else if (childCount == 0) {
						/*
						  	Otherwise, wait until the last child process has finished, and
						  	restart the build.
						 */
						getListOfSpecsToBuild();
					}
				}
			});
		}

	}
}


/**
 * Query the server for all topics that have been modified since the specified time
 * @param lastRun The time DocBuilder was last run
 */
function getModifiedTopics(lastRun, updatedSpecs) {
	var topicQuery = REST_SERVER + "/1/topics/get/json/query;";

	// If we have some last run info, use that to limit the search
	if (lastRun != null) {
		topicQuery += "startEditDate=" + encodeURIComponent(encodeURIComponent(lastRun));
	}
	topicQuery += "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22topics%22%7D%2C%20%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22contentSpecs_OTM%22%7D%7D%5D%7D%5D%7D%0A%0A";

	$.getJSON(topicQuery,
		function(data) {
			if (data.items) {
				for (var topicIndex = 0, topicCount = data.items.length; topicIndex < topicCount; ++topicIndex) {
					var topic = data.items[topicIndex].item;
					if (topic.contentSpecs_OTM) {
						for (var specIndex = 0, specCount = topic.contentSpecs_OTM.items.length; specIndex < specCount; ++specIndex) {
							var spec = topic.contentSpecs_OTM.items[specIndex].item;
							updatedSpecs.add({id: spec.id, product: spec.product, title: spec.title});
						}
					} else {
						console.log("topic.contentSpecs_OTM was not expected to be null");
					}
				}
			} else {
				console.log("data.items was not expected to be null");
			}

			topicsProcessed = true;
			buildBooks(updatedSpecs);
		});
}

/**
 * Query the server for all specs that have been modified since the specified time
 * @param lastRun The time DocBuilder was last run
 */
function getModifiedSpecs(lastRun, updatedSpecs) {
	var specQuery = REST_SERVER + "/1/contentspecs/get/json+text/query;";

	// If we have some last run info, use that to limit the search
	if (lastRun != null) {
		specQuery += "startEditDate=" + encodeURIComponent(encodeURIComponent(lastRun));
	}
	specQuery += "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22contentSpecs%22%7D%7D%5D%7D";

	$.getJSON(specQuery,
		function(data) {
			if (data.items) {
				for (var specIndex = 0, specCount = data.items.length; specIndex < specCount; ++specIndex) {
					var spec = data.items[specIndex].item;
					updatedSpecs.add({id: spec.id, product: spec.product, title: spec.title});
				}
			} else {
				console.log("data.items was not expected to be null");
			}

			specsProcessed = true;
			buildBooks(updatedSpecs);
		});
}

/**
 * Reads a file that holds the time DocBuilder last did a build, and then
 * finds the modified specs and topics.
 */
function getListOfSpecsToBuild() {
	var lastRun = null;

	if (thisBuildTime != null) {
		fs.writeFileSync(LAST_RUN_FILE, thisBuildTime);

		var now = moment();
		var diff = now.subtract(thisBuildTime).minutes();

		lastRun =  thisBuildTime;
		thisBuildTime = now.format(DATE_FORMAT);
	} else {
		// See if the last run file exists
		try {
			stats = fs.lstatSync(LAST_RUN_FILE);
			if (stats.isFile()) {
				lastRun = fs.readFileSync(LAST_RUN_FILE).toString().replace(/\n/g, "");
			}
		} catch (ex) {
			// the file or directory doesn't exist. leave lastRun as null.
		}
	}

	/*
		Reset the variables for this run.
	 */
	topicsProcessed = false;
	specsProcessed = false;
	var updatedSpecs = new set([]);

	getModifiedTopics(lastRun, updatedSpecs);
	getModifiedSpecs(lastRun, updatedSpecs);
}

getListOfSpecsToBuild();

