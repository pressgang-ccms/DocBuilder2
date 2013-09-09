var fs = require('fs');
var set = require('collections/sorted-set.js');
var iterator = require("collections/iterator");
var $ = require("jquery");
var moment = require('moment');
var exec = require('child_process').exec;

/*
	This application is designed to be asynchronous. It performs the following steps:
	1. Get all the topics and specs that have been modified since the supplied date
	2. Rebuild each spec (through an external script, but this may be merged into this code in future)
	3. Generate the index.html page

	In the background we are also pulling down the details of specs that are new or modified
	since the last run (so for the first run all specs will be new). This may mean that the
	index.html page has some "To be synced" info for the title, product and version, but the benefit
	is that we are not waiting for this info before rebuilding the new specs.

	And once the first run through is done, it is unlikely that the product, version or title will change,
	so there is little downside to having this information being slightly out of sync.
 */

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
var LAST_RUN_FILE = "/home/pressgang/.docbuilder/docbuilder2_lastrun";
//var LAST_RUN_FILE = "/home/matthew/.docbuilder/docbuilder2_lastrun";
/**
 * The format of the date to be supplied to the REST query.
 * @type {string}
 */
var DATE_FORMAT = "YYYY-MM-DDTHH:mm:ss.000Z";
/**
 * The maximum number of child processes to run at any given time.
 * @type {number}
 */
var MAX_PROCESSES = 12;
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
 * The script used to build the book
 * @type {string}
 */
var BUILD_BOOK_SCRIPT = "/home/pressgang/DocBuilder/build_original_books.sh";

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
/**
 * The index.html file build up with each run.
 * @type {string}
 */
var indexHtml = null;
/**
 * Keeps a copy of the version, title and product for each spec, and
 * updates the info as the specs are updated.
 * @type {object}
 */
var specDetailsCache = {};
/**
 * Keeps a list of the specs whose details have to be updated.
 * @type {Array}
 */
var pendingSpecCacheUpdates = new set([]);
/**
 * true if the pendingSpecCacheUpdates is being processed, and false otherwise.
 * @type {boolean}
 */
var processingPendingCacheUpdates = false;
/**
 * The time it took to do a rebuild.
 * @type {number}
 */
var diff = null;

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
							<p>To view the latest changes to a document, simply refresh the page.</p><p>Estimated Rebuild Time: " + (diff == null ? "Unknown" : diff) + " seconds</p>\n\
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
			indexHtml += " ];\n\
						rebuildTimeout = null;\n\
						productFilter.value = localStorage[\"productFilter\"] || \"\"; \n\
						titleFilter.value = localStorage[\"titleFilter\"] || \"\"; \n\
						versionFilter.value = localStorage[\"versionFilter\"] || \"\"; \n\
						idFilter.value = localStorage[\"idFilter\"] || \"\"; \n\
						save_filter = function() {\n\
							localStorage[\"productFilter\"] = productFilter.value;\n\
							localStorage[\"titleFilter\"] = titleFilter.value;\n\
							localStorage[\"versionFilter\"] = versionFilter.value;\n\
							localStorage[\"idFilter\"] = idFilter.value;\n\
							if (rebuildTimeout) {\n\
								window.clearTimeout(rebuildTimeout);\n\
								rebuildTimeout = null;\n\
							}\n\
							rebuildTimeout = setTimeout(function(){\n\
								build_table(data);\n\
								rebuildTimeout = null;\n\
							},1000);\n\
						}\n\
						reset_filter = function() {\n\
							localStorage[\"productFilter\"] = \"\";\n\
							localStorage[\"titleFilter\"] = \"\";\n\
							localStorage[\"versionFilter\"] = \"\";\n\
							localStorage[\"idFilter\"] = \"\";\n\
							productFilter.value = \"\";\n\
							titleFilter.value = \"\";\n\
							versionFilter.value = \"\";\n\
							idFilter.value = \"\";\n\
							if (rebuildTimeout) {\n\
								window.clearTimeout(rebuildTimeout);\n\
								rebuildTimeout = null;\n\
							}\n\
							build_table(data);\n\
						}\n\
						build_table(data);\n\
					</script>\n\
				</body>\n\
			</html>";

			processSpecs(updatedSpecs);
		}

		processSpecDetails = function(processIndex) {
			if (processIndex >= allSpecsArray.length) {
				finishProcessing();
			} else {
				var specId = allSpecsArray[processIndex];

				getLatestFile(PUBLICAN_BOOK_ZIPS_COMPLETE, specId.id + ".*?.zip", function(latest, latestFile) {

					var latestFileFixed = latestFile == null ? "" :encodeURIComponent(latestFile);

					var fixedSpecDetails = specDetailsCache[specId] ? specDetailsCache[specId] : {title: "To Be Synced", version: "To Be Synced", product: "To Be Synced"}
					
					indexHtml += "{\n\
						idRaw: " + specId + ",\n\
						id: '<a href=\"http://skynet.usersys.redhat.com:8080/pressgang-ccms-ui/#ContentSpecFilteredResultsAndContentSpecView;query;contentSpecIds=" + specId + "\" target=\"_top\">" + specId + "</a>',\n\
						versionRaw: '" + fixedSpecDetails.version + "',\n\
						version: '<a href=\"http://skynet.usersys.redhat.com:8080/pressgang-ccms-ui/#DocBuilderView;" + specId + "\" target=\"_top\">" + fixedSpecDetails.version + "</a>',\n\
						productRaw: '" + fixedSpecDetails.product + "',\n\
						product: '<a href=\"http://skynet.usersys.redhat.com:8080/pressgang-ccms-ui/#DocBuilderView;" + specId + "\" target=\"_top\">" + fixedSpecDetails.product + "</a>',\n\
						titleRaw: '" + fixedSpecDetails.title + "', title: '<a href=\"http://skynet.usersys.redhat.com:8080/pressgang-ccms-ui/#DocBuilderView;" + specId + "\"  target=\"_top\">" + fixedSpecDetails.title + "</a>',\n\
						remarks: '<a href=\"" + specId + "/remarks\"><button>With Remarks</button></a>',\n\
						buildlog: '<a href=\"" + specId + "/build.log\"><button>Build Log</button></a>',\n\
						publicanbook: '<a href=\"" + PUBLICAN_BOOK_ZIPS + "/" + latestFileFixed + "\"><button>Publican ZIP</button></a>',\n\
						publicanlog: '<a href=\"" + specId + "/publican.log\"><button>Publican Log</button></a>'\n\
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
	if (updatedSpecs.length == 0) {
		getListOfSpecsToBuild();
	} else {
		for (var processIndex = existingChildren, processCount = updatedSpecs.length < MAX_PROCESSES ? updatedSpecs.length : MAX_PROCESSES; processIndex < processCount; ++processIndex) {
			var specId = updatedSpecs.pop();
			++childCount;

			console.log("Starting build of modified book " + specId + " (" + updatedSpecs.pop() + " specs remain)");

			exec(BUILD_BOOK_SCRIPT + " " + specId + " " + specId, function(id) {
				return function(error, stdout, stderr) {
					--childCount;

					console.log("Finished build of modified book " + id);

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
				};
			}(specId));
		}
	}
}

/**
 * Query the server for all topics that have been modified since the specified time
 * @param lastRun The time DocBuilder was last run
 */
function getModifiedTopics(lastRun, updatedSpecs, allSpecsArray) {
	/**
	 * If there is no lastRun then we know that all specs have to be rebuilt. This is accounted
	 * for in the getSpecs() function. There is no need to get all the topics, so we just
	 * call buildBooks() directly and exit.
	 */
	if (!lastRun) {
		topicsProcessed = true;
		buildBooks(updatedSpecs, allSpecsArray);
		return;
	}

	var topicQuery = REST_SERVER + "/1/topics/get/json/query;";

	// If we have some last run info, use that to limit the search
	if (lastRun != null) {
		topicQuery += "startEditDate=" + encodeURIComponent(encodeURIComponent(lastRun));
	}
	topicQuery += "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22topics%22%7D%2C%20%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22contentSpecs_OTM%22%7D%7D%5D%7D%5D%7D%0A%0A";

	//console.log("Getting modified topics from URL " + topicQuery);
	console.log("Finding modified topics");

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
 * Add the spec ID to the list of specs that we need to pull down the latest
 * product, title and version info for.
 * @param id The id of the spec whose details need to be refreshed
 */
function addSpecToListOfPendingUpdates(id) {
	pendingSpecCacheUpdates.add(id);
	if (!processingPendingCacheUpdates) {
		processPendingSpecUpdates();
	}
}

/**
 * This function will be called recursively until the details for the specs are updated.
 */
function processPendingSpecUpdates() {
	processingPendingCacheUpdates = true;

	if (pendingSpecCacheUpdates.length != 0) {
		var specId = pendingSpecCacheUpdates.pop();

		var specDetailsQuery = REST_SERVER + "/1/contentspecnodes/get/json/query;csNodeType=7;contentSpecIds=" + specId + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22nodes%22%7D%7D%5D%7D";

		if (!specDetailsCache[specId]) {
			specDetailsCache[specId] = {};
		}

		console.log("Filling spec cache. " + pendingSpecCacheUpdates.length + " calls to be made.");

		$.getJSON(specDetailsQuery,
			function(data) {
				if (data.items) {
				 	for (var i = 0, count = data.items.length; i < count; ++i) {
						var item = data.items[i].item;

						if (item.title == "Title") {
							specDetailsCache[specId].title = item.additionalText;
						} else if (item.title == "Version") {
							specDetailsCache[specId].version = item.additionalText;
						} else if (item.title == "Product") {
							specDetailsCache[specId].product = item.additionalText;
						}
					}
				}

				processPendingSpecUpdates();
			}).error(function(jqXHR, textStatus, errorThrown) {
				console.log("Call to " + specDetailsQuery + " failed!");
				console.log(errorThrown);
				processPendingSpecUpdates();
			});
	} else {
		processingPendingCacheUpdates = false;
	}
}

/**
 * Query the server for all specs that have been modified since the specified time
 * @param lastRun The time DocBuilder was last run
 */
function getSpecs(lastRun, updatedSpecs, allSpecsArray) {
	var specQuery = REST_SERVER + "/1/contentspecs/get/json/query;";

	specQuery += "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22contentSpecs%22%7D%7D%5D%7D";

	//console.log("Getting specs from URL " + specQuery);
	console.log("Finding content specs");

	$.getJSON(specQuery,
		function(data) {
			if (data.items) {

				console.log("Found " + data.items.length + " content specs");

				for (var specIndex = 0, specCount = data.items.length; specIndex < specCount; ++specIndex) {
					var spec = data.items[specIndex].item;

					/*
						We haven't processed this spec yet
					 */
					if (!specDetailsCache[spec.id]) {
						addSpecToListOfPendingUpdates(spec.id);
					}

					allSpecsArray.push(spec.id);

					var lastEdited = moment(spec.lastModified);
					if (!lastRun || lastEdited.isAfter(lastRun)) {
						updatedSpecs.add(spec.id);
						addSpecToListOfPendingUpdates(spec.id);
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

/**
 * If there was a failure with a rest call, this function will be called, which
 * will start again as if this was the first run.
 */
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

	var now = moment();

	if (thisBuildTime != null) {
		lastRun = thisBuildTime.format(DATE_FORMAT);

		try {
			fs.writeFileSync(LAST_RUN_FILE, lastRun);
		} catch (ex) {
			console.log("Could not save " + LAST_RUN_FILE);
		}

		diff = moment().subtract(thisBuildTime).seconds();
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

	/*
		Make a note of when we started this run.
	 */
	thisBuildTime = now;



	getModifiedTopics(lastRun, updatedSpecs, allSpecs);
	getSpecs(lastRun, updatedSpecs, allSpecs);
}

/**
 * Calls the done function with the filename and last modified date of the file that was most recently modified
 * @param dir The directory to search
 * @param filter The format that the file names have to match to be considered
 * @param done a function to call when the latest file is found
 */
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

