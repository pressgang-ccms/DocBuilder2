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
//var REST_SERVER = "http://topicindex-dev.ecs.eng.bne.redhat.com:8080/pressgang-ccms/rest";
var REST_SERVER = "http://topika.ecs.eng.bne.redhat.com:8080/pressgang-ccms/rest";
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

var indexHtml = null;

/**
 * Called when the modified topics and specs have been found. Once both
 * functions have called this function, the process of actually building the
 * books will start.
 */
function buildBooks(updatedSpecs, allSpecsArray) {
	if (specsProcessed && topicsProcessed) {

		indexHtml = "<html>\n\
			<head>\n\
				<title>Docbuilder Index</title>\n\
				<link rel=\"stylesheet\" href=\"index.css\"/>\n\
				<script src=\"http://yui.yahooapis.com/3.10.0/build/yui/yui-min.js\"></script>\n\
				<script src=\"functions-1.1.js\" ></script>\n\
			</head>\n\
			<body onload=\"setLangSelectLanguage()\">\n\
				<div class=\"container\">\n\
					<div class=\"langBar\">Language:\n\
						<select id=\"lang\" class=\"langSelect\" onchange=\"changeLang(this)\">\n\
							<option selected value=\"\">English</option>\n\
							<option value=\"zh-Hans\">Chinese</option>\n\
							<option value=\"fr\">French</option>\n\
							<option value=\"de\">German</option>\n\
							<option value=\"ja\">Japanese</option>\n\
							<option value=\"pt-BR\">Portuguese</option>\n\
							<option value=\"es\">Spanish</option>\n\
						</select>\n\
					</div>\n\
					<div class=\"content\">\n\
						<div>\n\
							<img height=\"87\" src=\"pg.png\" width=\"879\">\n\
						</div>\n\
						<div style=\"margin-top:1em\">\n\
							<p>DocBuilder is a service that automatically rebuilds content specifications as they are created or edited.</p>\n\
							<p>Each content spec has three links: a link to the compiled book itself, a link to the build log, and a link to the publican log.</p>\n\
							<p>If a book could not be built, first check the build log. This log contains information that may indicate syntax errors in the content specification. You can also view this log to see when the document was last built.</p>\n\
							<p>If the build log has no errors, check the publican log. This may indicate some syntax errors in the XML.</p>\n\
							<p>The topics in each document include a \"Edit this topic\" link, which will take you to the topic in the CCMS.</p>\n\
							<p>To view the latest changes to a document, simply refresh the page.</p><p>Estimated Rebuild Time: ${REBUILD_TIME}</p>\n\
						</div>\n\
						<div></div>\n\
						<div>\n\
							<table>\n\
								<tr>\n\
									<td>\n\
										ID Filter\n\
									</td>\n\
									<td>\n\
										<input type=\"text\" id=\"idFilter\" onkeyup=\"save_filter()\">\n\
									</td>\n\
									<td>\n\
										Product Filter\n\
									</td>\n\
									<td>\n\
										<input type=\"text\" id=\"productFilter\" onkeyup=\"save_filter()\">\n\
									</td>\n\
									<td rowspan=\"2\">\n\
										<button onclick=\"reset_filter()\">Reset</button>\n\
									</td>\n\
								</tr>\n\
								<tr>\n\
									<td>\n\
										Version Filter\n\
									</td>\n\
									<td>\n\
										<input type=\"text\" id=\"versionFilter\" onkeyup=\"save_filter()\">\n\
									</td>\n\
									<td>\n\
										Title Filter\n\
									</td>\n\
									<td>\n\
										<input type=\"text\" id=\"titleFilter\" onkeyup=\"save_filter()\">\n\
									</td>\n\
								</tr>\n\
							</table> \n\
							</div>\n\
							<div></div>\n\
						</div>\n\
						</div>\n\
						<script>\n\
							// build the array that holds the details of the books \n\
							var data = [\n";

		finishProcessing = function() {
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

			processSpecs(updatedSpecs);
		}

		processSpecDetails = function(processIndex) {
			if (processIndex >= allSpecsArray.length) {
				finishProcessing();
			} else {
				var specDetails = allSpecsArray[processIndex];

				getLatestFile(PUBLICAN_BOOK_ZIPS_COMPLETE, specDetails.id + ".*?.zip", function(latest, latestFile) {

					var latestFileFixed = latestFile == null ? "" :encodeURIComponent(latestFile);

					indexHtml += "{\n\
						idRaw: " + specDetails.id + ",\n\
						id: '<a href=\"http://skynet.usersys.redhat.com:8080/pressgang-ccms-ui/#ContentSpecFilteredResultsAndContentSpecView;query;contentSpecIds=" + specDetails.id + "\" target=\"_top\">" + specDetails.id + "</a>',\n\
						versionRaw: '" + specDetails.version + "',\n\
						version: '<a href=\"http://skynet.usersys.redhat.com:8080/pressgang-ccms-ui/#DocBuilderView;" + specDetails.id + "\" target=\"_top\">" + specDetails.version + "</a>',\n\
						productRaw: '" + specDetails.product + "',\n\
						product: '<a href=\"http://skynet.usersys.redhat.com:8080/pressgang-ccms-ui/#DocBuilderView;" + specDetails.id + "\" target=\"_top\">" + specDetails.product + "</a>',\n\
						titleRaw: '${TITLE}', title: '<a href=\"http://skynet.usersys.redhat.com:8080/pressgang-ccms-ui/#DocBuilderView;" + specDetails.id + "\"  target=\"_top\">" + specDetails.title + "</a>',\n\
						remarks: '<a href=\"" + specDetails.id + "/remarks\"><button>With Remarks</button></a>',\n\
						buildlog: '<a href=\"" + specDetails.id + "/build.log\"><button>Build Log</button></a>',\n\
						publicanbook: '<a href=\"" + PUBLICAN_BOOK_ZIPS + "/" + latestFileFixed + "\"><button>Publican ZIP</button></a>',\n\
						publicanlog: '<a href=\"" + specDetails.id + "/publican.log\"><button>Publican Log</button></a>'\n\
					},\n";

					processSpecDetails(++processIndex);
				});
			}
		}

		processSpecDetails(0);
	}
}

/**
 * Start MAX_PROCESSES (or updatedSpecs.length if that is less) processes, with each recursive call
 * starting another process until all the specs have been built.
 * @param updatedSpecs
 */
function processSpecs(updatedSpecs) {
	var existingChildren = childCount;
	for (var processIndex = existingChildren, processCount = updatedSpecs.length < MAX_PROCESSES ? updatedSpecs.length : MAX_PROCESSES; processIndex < processCount; ++processIndex) {
		var specId = updatedSpecs.pop();
		++childCount;
		exec("echo " + specId, function(error, stdout, stderr) {
			--childCount;
			if (childCount < MAX_PROCESSES) {

				if (updatedSpecs.length != 0) {
					/*
					 If there are still specs to be processed, then process them
					 */
					processSpecs(updatedSpecs);
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


/**
 * Query the server for all topics that have been modified since the specified time
 * @param lastRun The time DocBuilder was last run
 */
function getModifiedTopics(lastRun, updatedSpecs, allSpecsArray) {
	var topicQuery = REST_SERVER + "/1/topics/get/json/query;";

	// If we have some last run info, use that to limit the search
	if (lastRun != null) {
		topicQuery += "startEditDate=" + encodeURIComponent(encodeURIComponent(lastRun));
	}
	topicQuery += "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22topics%22%7D%2C%20%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22contentSpecs_OTM%22%7D%7D%5D%7D%5D%7D%0A%0A";

	console.log("Getting modified topics from URL " + topicQuery);

	$.getJSON(topicQuery,
		function(data) {
			if (data.items) {

				console.log("Found " + data.items.length + " modified topics.");

				for (var topicIndex = 0, topicCount = data.items.length; topicIndex < topicCount; ++topicIndex) {
					var topic = data.items[topicIndex].item;
					if (topic.contentSpecs_OTM) {
						for (var specIndex = 0, specCount = topic.contentSpecs_OTM.items.length; specIndex < specCount; ++specIndex) {
							var spec = topic.contentSpecs_OTM.items[specIndex].item;
							updatedSpecs.add(spec.id);
						}
					} else {
						console.log("topic.contentSpecs_OTM was not expected to be null");
					}
				}
			} else {
				console.log("data.items was not expected to be null");
			}

			topicsProcessed = true;
			buildBooks(updatedSpecs, allSpecsArray);
		}).error(function(jqXHR, textStatus, errorThrown) {
			console.log("Call to " + topicQuery + " failed!");
			console.log(errorThrown);
			restartAfterFailure();
		});
}

/**
 * Query the server for all specs that have been modified since the specified time
 * @param lastRun The time DocBuilder was last run
 */
function getSpecs(lastRun, updatedSpecs, allSpecsArray) {
	var specQuery = REST_SERVER + "/1/contentspecs/get/json/query;";

	specQuery += "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22contentSpecs%22%7D%7D%5D%7D";

	console.log("Getting specs from URL " + specQuery);

	$.getJSON(specQuery,
		function(data) {
			if (data.items) {

				console.log("Found " + data.items.length + " content specs");

				for (var specIndex = 0, specCount = data.items.length; specIndex < specCount; ++specIndex) {
					var spec = data.items[specIndex].item;
					var specDetails = {id: spec.id, product: spec.product, title: spec.title};
					allSpecsArray.push(specDetails);

					var lastEdited = moment(spec.lastModified);
					if (!lastRun || lastEdited.isAfter(lastRun)) {
						updatedSpecs.add(spec.id);
					}
				}

				console.log("Found " + updatedSpecs.length + " modified content specs");
			} else {
				console.log("data.items was not expected to be null");
			}

			specsProcessed = true;
			buildBooks(updatedSpecs, allSpecsArray);
		}).error(function(jqXHR, textStatus, errorThrown) {
			console.log("Call to " + specQuery + " failed!");
			console.log(errorThrown);
			restartAfterFailure();
		});
}

function restartAfterFailure() {
	indexHtml = null;
	thisBuildTime = null;
	getListOfSpecsToBuild();
}

/**
 * Reads a file that holds the time DocBuilder last did a build, and then
 * finds the modified specs and topics.
 */
function getListOfSpecsToBuild() {
	var lastRun = null;

	if (indexHtml != null) {
		/*
		 	Save the index.html file
		 */
		try {
			fs.writeFileSync(INDEX_HTML, indexHtml);
		} catch (ex) {
			console.log("Could not save " + INDEX_HTML);
		}

		indexHtml = null;
	}

	if (thisBuildTime != null) {
		try {
			fs.writeFileSync(LAST_RUN_FILE, thisBuildTime);
		} catch (ex) {
			console.log("Could not save " + LAST_RUN_FILE);
		}

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
	var allSpecs = [];

	getModifiedTopics(lastRun, updatedSpecs, allSpecs);
	getSpecs(lastRun, updatedSpecs, allSpecs);
}

function sortContentSpecs(a, b) {
	if (!a && !b) {
		return 0;
	}
	if (!a) {
		return 1;
	}
	if (!b) {
		return -1;
	}
	if (!a.id && !b.id) {
		return 0;
	}
	if (!a.id) {
		return 1;
	}
	if (!b.id) {
		return -1;
	}

	return a.id < b.id;
}

function compareContentSpecs(a, b) {
	if (!a && !b) {
		return true;
	}
	if (!a) {
		return false;
	}
	if (!b) {
		return false;
	}
	if (!a.id && !b.id) {
		return true;
	}
	if (!a.id) {
		return false;
	}
	if (!b.id) {
		return false;
	}

	return a.id === b.id;
}

function getLatestFile (dir, filter, done) {
	fs.readdir(dir, function (error, list) {
		if (error) {
			return done(error);
		}

		var i = 0;

		(function next (latest, latestFile) {
			var file = list[i++];

			if (!file) {
				return done(null, latest, latestFile);
			}

			if (file.toString().match(filter)) {

				var fullFile = dir + '/' + file;

				fs.stat(fullFile, function (error, stat) {

					if (stat && stat.isDirectory()) {
						walk(file, function (error) {
							next();
						});
					} else {

						var lastModified = moment(stat.mtime);
						if (!latest || lastModified.isAfter(latest)) {
							latest = lastModified;
							latestFile = file;
						}

						next(latest, latestFile);
					}
				});
			} else {
				next(latest, latestFile);
			}
		})();
	});
};

getListOfSpecsToBuild();

