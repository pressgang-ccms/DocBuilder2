var deployment = require("./deployment_details.js");
var fs = require('fs');
var set = require('collections/sorted-set.js');
var iterator = require("collections/iterator");
var $ = require("jquery");
var moment = require('moment');
var exec = require('child_process').exec;

/*
	This application is designed to be asynchronous. It performs the following steps:
	1.  Get all the topics and specs that have been modified since the supplied date. This involves two asynchronous
		REST calls.
	2. 	Rebuild each spec (through an external script, but this may be merged into this code in future). We will launch
 		MAX_PROCESSES asynchronous scripts to run csprocessor/publican to build the spec.
	3. 	Save the index.html page and start again.

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
var REST_SERVER = "http://" + deployment.BASE_SERVER + "/pressgang-ccms/rest";
/**
 * The format of the date to be supplied to the REST query.
 * @type {string}
 */
var DATE_FORMAT = "YYYY-MM-DDTHH:mm:ss.000Z";
/**
 * The directory that holds the Publican ZIP files
 */
var PUBLICAN_BOOK_ZIPS= "/books";
/**
 *	The complete directory that holds the Publican ZIP files
 */
var PUBLICAN_BOOK_ZIPS_COMPLETE=deployment.APACHE_HTML_DIR + PUBLICAN_BOOK_ZIPS;
/**
 * The script used to build the book
 * @type {string}
 */
var BUILD_BOOK_SCRIPT = "/home/pressgang/DocBuilder2/build_original_books.sh";
/**
 * The amount of time to wait, in milliseconds, before querying the server when no
 * updates were found.
 * @type {number}
 */
var DELAY_WHEN_NO_UPDATES = 60000;
/**
 * The frozen tag id
 * @type {number}
 */
var FROZEN_TAG = 669;
/**
 * The obsolete tag id
 * @type {number}
 */
var OBSOLETE_TAG = 652;

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
 * @type {moment}
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
 * true if the REST call to get the list of modified specs failed
 * @type {boolean}
 */
var contentSpecRESTCallFailed = false;
/**
 * true if the REST call to get the list of modified topics failed
 * @type {boolean}
 */
var topicRESTCallFailed = false;



/**
 * Called when the modified topics and specs have been found. Once both
 * functions have called this function, the process of actually building the
 * books will start.
 */
function buildBooks(updatedSpecs, allSpecsArray) {

	indexHtml = "<html>\n\
		<head>\n\
			<title>Docbuilder Index</title>\n\
			<link rel=\"stylesheet\" href=\"index.css\"/>\n\
			<script src=\"http://yui.yahooapis.com/3.10.0/build/yui/yui-min.js\"></script>\n\
			<script src=\"http://code.jquery.com/jquery-2.0.3.min.js\"></script>\n\
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
						<img height=\"" + deployment.LOGO_HEIGHT + "\" src=\"" + deployment.LOGO + "\" width=\"" + deployment.LOGO_WIDTH + "\">\n\
					</div>\n\
					<div style=\"margin-top:1em\">\n\
						<p><a href=\"http://docbuilder.ecs.eng.bne.redhat.com/\">DocBuilder Next</a> has the latest updates, but will sometimes introduce breaking changes.</p>\n\
						<p><a href=\"http://docbuilder.lab.eng.pnq.redhat.com/\">DocBuilder</a> is the stable release, and can be used as a fallback for DocBuilder Next.</p>\n\
						<p>DocBuilder is a service that automatically rebuilds content specifications as they are created or edited.</p>\n\
						<p>Each content spec has three links: a link to the compiled book itself, a link to the build log, and a link to the publican log.</p>\n\
						<p>If a book could not be built, first check the build log. This log contains information that may indicate syntax errors in the content specification. You can also view this log to see when the document was last built.</p>\n\
						<p>If the build log has no errors, check the publican log. This may indicate some syntax errors in the XML.</p>\n\
						<p>The topics in each document include a \"Edit this topic\" link, which will take you to the topic in the CCMS.</p>\n\
						<p>To view the latest changes to a document, simply refresh the page.</p><p>Estimated Rebuild Time: " + (diff == null ? "Unknown" : (diff/60).toFixed(1)) + " minutes</p>\n\
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
							<tr>\n\
								<td>\n\
									Topic ID Filter\n\
								</td>\n\
								<td>\n\
									<input type=\"text\" id=\"topicIDFilter\" onkeyup=\"save_filter()\">\n\
								</td>\n\
								<td>\n\
								    Show Obsolete Specs\n\
								</td>\n\
								<td>\n\
								    <input type=\"checkbox\" id=\"specObsoleteFilter\" onchange=\"save_filter()\">\n\
								</td>\n\
							</tr>\n\
							<tr>\n\
								<td>\n\
									Show Frozen Specs\n\
								</td>\n\
								<td>\n\
                                    <input type=\"checkbox\" id=\"specFrozenFilter\" onchange=\"save_filter()\">\n\
								</td>\n\
								<td>\n\
								</td>\n\
								<td>\n\
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
					topicIDFilter.value = localStorage[\"topicIDFilter\"] || \"\"; \n\
					specObsoleteFilter.checked = localStorage[\"specObsoleteFilter\"] && localStorage[\"specObsoleteFilter\"].length != 0 \n\
                        ? (localStorage[\"specObsoleteFilter\"].toLowerCase() == true.toString().toLowerCase() ? true : false) : false; \n\
                    specFrozenFilter.checked = localStorage[\"specFrozenFilter\"] && localStorage[\"specFrozenFilter\"].length != 0 \n\
                        ? (localStorage[\"specFrozenFilter\"].toLowerCase() == true.toString().toLowerCase() ? true : false) : false; \n\
					save_filter = function() {\n\
						localStorage[\"productFilter\"] = productFilter.value;\n\
						localStorage[\"titleFilter\"] = titleFilter.value;\n\
						localStorage[\"versionFilter\"] = versionFilter.value;\n\
						localStorage[\"idFilter\"] = idFilter.value;\n\
						localStorage[\"topicIDFilter\"] = topicIDFilter.value;\n\
						localStorage[\"specObsoleteFilter\"] = specObsoleteFilter.checked.toString();\n\
						localStorage[\"specFrozenFilter\"] = specFrozenFilter.checked.toString();\n\
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
						localStorage[\"topicIDFilter\"] = \"\";\n\
						localStorage[\"specObsoleteFilter\"] = \"\";\n\
						localStorage[\"specFrozenFilter\"] = \"\";\n\
						productFilter.value = \"\";\n\
						titleFilter.value = \"\";\n\
						versionFilter.value = \"\";\n\
						idFilter.value = \"\";\n\
						topicIDFilter.value = \"\";\n\
						specObsoleteFilter.checked = false;\n\
						specFrozenFilter.checked = false;\n\
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
		if (processIndex > allSpecsArray.length) {
			console.log("Error: processIndex > allSpecsArray.length");
			return;
		}

		if (processIndex == allSpecsArray.length) {
			finishProcessing();
		} else {
			var specId = allSpecsArray[processIndex];

			getLatestFile(PUBLICAN_BOOK_ZIPS_COMPLETE, specId + ".*?\\.zip", function(error, latest, latestFile) {

				var latestFileFixed = latestFile == null ? "" :encodeURIComponent(latestFile);

				var fixedSpecDetails = specDetailsCache[specId] ?
				{
					title: specDetailsCache[specId].title ? specDetailsCache[specId].title.replace(/'/g, "\\'") : "",
					version: specDetailsCache[specId].version ? specDetailsCache[specId].version.replace(/'/g, "\\'") : "",
					product: specDetailsCache[specId].product ? specDetailsCache[specId].product.replace(/'/g, "\\'") : "",
                    tags: specDetailsCache[specId].tags ? specDetailsCache[specId].tags : []
				}
				:
				{
					title: "To Be Synced",
					version: "To Be Synced",
					product: "To Be Synced",
                    tags: []
				};

                // select an image based on the presence of the index.html file
                var image = fs.existsSync(deployment.APACHE_HTML_DIR + "/" + specId + "/index.html") ? 'url(/images/tick.png)' : 'url(/images/cross.png)';

                var isFrozen = false;

                for (var tagIndex = 0, tagCount = fixedSpecDetails.tags.length; tagIndex < tagCount; ++tagIndex ) {
                    if (fixedSpecDetails.tags[tagIndex] == FROZEN_TAG) {
                        isFrozen = true;
                        break;
                    }
                }

                var isObsolete = false;

                for (var tagIndex = 0, tagCount = fixedSpecDetails.tags.length; tagIndex < tagCount; ++tagIndex ) {
                    if (fixedSpecDetails.tags[tagIndex] == OBSOLETE_TAG) {
                        isObsolete = true;
                        break;
                    }
                }

                var freezeLabel = isFrozen ? "Unfreeze" : "Freeze";
                var obsoleteLabel = isObsolete ? "Unobsolete" : "Obsolete";

				indexHtml += "{\n\
					idRaw: " + specId + ",\n\
					id: '<a href=\"" + deployment.EDIT_LINK.replace(deployment.OPEN_LINK_ID_REPLACE, specId) + "\" target=\"_top\">" + specId + "</a>',\n\
					versionRaw: '" + fixedSpecDetails.version + "',\n\
					version: '<a href=\"" + deployment.OPEN_LINK.replace(deployment.OPEN_LINK_ID_REPLACE, specId) + "\" target=\"_top\">" + fixedSpecDetails.version + "</a>',\n\
					productRaw: '" + fixedSpecDetails.product + "',\n\
					product: '<a href=\"" + deployment.OPEN_LINK.replace(deployment.OPEN_LINK_ID_REPLACE, specId) + "\" target=\"_top\">" + fixedSpecDetails.product + "</a>',\n\
					titleRaw: '" + fixedSpecDetails.title + "', title: '<a href=\"" + deployment.OPEN_LINK.replace(deployment.OPEN_LINK_ID_REPLACE, specId) + "\"  target=\"_top\">" + fixedSpecDetails.title + "</a>',\n\
					remarks: '<a href=\"" + specId + "/remarks\"><button>With Remarks</button></a>',\n\
					buildlog: '<a href=\"" + specId + "/build.log\"><button>Build Log</button></a>',\n\
					publicanbook: '<a href=\"" + PUBLICAN_BOOK_ZIPS + "/" + latestFileFixed + "\"><button>Publican ZIP</button></a>',\n\
					publicanlog: '<a href=\"" + specId + "/publican.log\"><button>Publican Log</button></a>',\n\
					tags: [" + fixedSpecDetails.tags.toString() + "],\n\
                    status: '<div style=\"width: 32px; height: 32px; background-image: " + image + "; background-size: cover\"/>'\n\
				},\n";

				processSpecDetails(++processIndex);
			});
		}
	}

	processSpecDetails(0);
}

/**
 * Start MAX_PROCESSES (or updatedSpecs.length if that is less) processes, with each recursive call
 * starting another process until all the specs have been built.
 * @param updatedSpecs
 */
function processSpecs(updatedSpecs) {
	if (updatedSpecs.length == 0) {
		/*
			There were no specs to build, so start again after a short delay.
		 */
		console.log("Delaying for " + DELAY_WHEN_NO_UPDATES / 1000 + " seconds");
		setTimeout((function() {
			getListOfSpecsToBuild();
		}), DELAY_WHEN_NO_UPDATES);
	} else {
		for (var processIndex = 0, processCount = updatedSpecs.length < (deployment.MAX_PROCESSES - childCount) ? updatedSpecs.length : (deployment.MAX_PROCESSES - childCount); processIndex < processCount; ++processIndex) {
			var specId = updatedSpecs.pop();
			++childCount;

			console.log("Starting build of modified book " + specId + " (" + updatedSpecs.length + " specs remain)");

			exec(BUILD_BOOK_SCRIPT + " " + specId + " " + specId, function(id) {
				return function(error, stdout, stderr) {
					--childCount;

					console.log("Finished build of modified book " + id);

                    /*
                        Add the style, scripts and constants required to build the side menu
                     */
                    var scriptFiles = "\
                                <script type='application/javascript'>\n\
                                    var BASE_SERVER = '" + deployment.BASE_SERVER + "';\n\
                                    var SPEC_ID = " + specId + ";\n\
                                </script>\n\
                                <script type='application/javascript' src='/javascript/jquery-2.0.3.min.js'></script>\n\
                                <script type='application/javascript' src='/javascript/moment.min.js'></script>\n\
                                <script type='application/javascript' src='/javascript/bootstrap.min.js'></script>\n\
                                <script type='application/javascript' src='/javascript/bootbox.min.js'></script>\n\
                                <script type='application/javascript' src='/javascript/raphael-min.js'></script>\n\
                                <script type='application/javascript' src='/javascript/pie.js'></script>\n\
                                <script type='application/javascript' src='/javascript/typo_proto.js'></script>\n\
                                <script type='application/javascript' src='/javascript/typo.js'></script>\n\
                                <script type='application/javascript' src='/javascript/overlay.js'></script>\n\
                                <script type='application/javascript' src='/javascript/pressgang_websites.js'></script>\n\
                                <script type='application/javascript' src='http://docbuilder.usersys.redhat.com/13968/html/files/pressgang_website.js' async></script>\n\
                                </body>\n\
								</html>";

					var styleFiles = "<head>\n\
						<link href='/css/pressgang.css' rel='stylesheet'>\n\
						<link href='/css/style.css' rel='stylesheet'>\n\
                        <link href='/css/bootstrap.min.css' rel='stylesheet'>\n";

                    // Append the custom javascript files to the index.html
                    try {
                        var contents = fs.readFileSync(deployment.APACHE_HTML_DIR + "/" + id + "/index.html").toString();
                        contents = contents.replace("<head>", styleFiles);
						contents = contents.replace("</body></html>", scriptFiles);
                        fs.writeFileSync(deployment.APACHE_HTML_DIR + "/" + id + "/index.html", contents);
                    } catch (ex) {
                        console.log("Could not edit and save main HTML file");
                    }

                    try {
                        var contents = fs.readFileSync(deployment.APACHE_HTML_DIR + "/" + id + "/remarks/index.html").toString();
						contents = contents.replace("<head>", styleFiles);
						contents = contents.replace("</body></html>", scriptFiles);
                        fs.writeFileSync(deployment.APACHE_HTML_DIR + "/" + id + "/remarks/index.html", contents);
                    } catch (ex) {
                        console.log("Could not edit and save remarks HTML file");
                    }

					if (childCount < deployment.MAX_PROCESSES) {

						if (updatedSpecs.length != 0) {
							/*
							 	If there are still specs to be processed, then process them
							 */
							processSpecs(updatedSpecs);
						} else if (childCount == 0) {
							var runTimeSeconds = moment().unix() - thisBuildTime.unix();
							var delay = (DELAY_WHEN_NO_UPDATES / 1000) - runTimeSeconds;

							if (delay <= 0) {
								getListOfSpecsToBuild();
							} else {

								console.log("Delaying for " + delay + " seconds");

								setTimeout((function() {
									getListOfSpecsToBuild();
								}), delay * 1000);
							}
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
		routeAfterRESTCalls(updatedSpecs, allSpecsArray);
		return;
	}

	var topicQuery = REST_SERVER + "/1/topics/get/json/query;";

	// If we have some last run info, use that to limit the search
	topicQuery += "startEditDate=" + encodeURIComponent(encodeURIComponent(lastRun.format(DATE_FORMAT)));
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
			routeAfterRESTCalls(updatedSpecs, allSpecsArray);
		}).error(function(jqXHR, textStatus, errorThrown) {
			console.log("Call to " + topicQuery + " failed!");
			console.log(errorThrown);
			topicRESTCallFailed = true;
			routeAfterRESTCalls();
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

        var nodesQueryFinished = false;
        var tagsQueryFinished = false;

        var finished = function() {
            if (nodesQueryFinished && tagsQueryFinished) {
                processPendingSpecUpdates();
            }
        }

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
                nodesQueryFinished = true;
                finished();
			}).error(function(jqXHR, textStatus, errorThrown) {
				console.log("Call to " + specDetailsQuery + " failed!");
                nodesQueryFinished = true;
                finished();
			});

        var specTagQuery = REST_SERVER + "/1/contentspec/get/json/" + specId + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22tags%22%7D%7D%5D%7D";

        $.getJSON(specTagQuery,
            function(data) {
                if (data.tags) {

                    specDetailsCache[specId].tags = [];

                    for (var i = 0, count = data.tags.items.length; i < count; ++i) {
                        var tag = data.tags.items[i].item;
                        specDetailsCache[specId].tags.push(tag.id);
                    }
                }
                tagsQueryFinished = true;
                finished();
            }).error(function(jqXHR, textStatus, errorThrown) {
                console.log("Call to " + tagsQueryFinished + " failed!");
                tagsQueryFinished = true;
                finished();
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

	var specQuery = REST_SERVER + "/1/contentspecs/get/json/query;?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22contentSpecs%22%7D%7D%5D%7D";

	//console.log("Getting specs from URL " + specQuery);
	console.log("Finding content specs");

	$.getJSON(specQuery,
		function(data) {
			if (data.items) {

				console.log("Found " + data.items.length + " content specs");

				for (var specIndex = 0, specCount = data.items.length; specIndex < specCount; ++specIndex) {
				//for (var specIndex = 0, specCount = 1; specIndex < specCount; ++specIndex) {
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
			routeAfterRESTCalls(updatedSpecs, allSpecsArray);
		}).error(function(jqXHR, textStatus, errorThrown) {
			console.log("Call to " + specQuery + " failed!");
			console.log(errorThrown);
			contentSpecRESTCallFailed = true;
			routeAfterRESTCalls();
		});
}

/**
 * Two REST calls need to compete before we can move on. There are 4 possible outcomes of these 2 REST calls:
 * 1. both succeed
 * 2. both fail
 * 3. the spec call succeeds while the topic call fails
 * 4. the topic call succeeds while the spec call fails
 *
 * If both calls succeed, we want to process the changed specs. If one or more of the calls fail, we want to
 * restart after a short delay.
 *
 * If one REST call has not completed when this function is called, no decision is made.
 */
function routeAfterRESTCalls(updatedSpecs, allSpecsArray) {

	if (specsProcessed && topicsProcessed) {
		// both REST calls succeeded
		buildBooks(updatedSpecs, allSpecsArray);
	} else if (contentSpecRESTCallFailed && topicRESTCallFailed) {
		// both REST calls failed
		restartAfterFailure();
	} else if ((specsProcessed && topicRESTCallFailed) ||
			   (topicsProcessed && contentSpecRESTCallFailed)) {
		// One rest call succeeded while the other failed
		restartAfterFailure();
	}

	// otherwise one REST call is still to succeed or fail, so do nothing
}

/**
 * If there was a failure with a rest call, this function will be called, which
 * will start again as if this was the first run.
 */
function restartAfterFailure() {
	var runTimeSeconds = moment().unix() - thisBuildTime.unix();
	var delay = (DELAY_WHEN_NO_UPDATES / 1000) - runTimeSeconds;

    indexHtml = null;
    thisBuildTime = null;

	if (delay <= 0) {
		getListOfSpecsToBuild();
	} else {

		console.log("Delaying for " + delay + " seconds");

		setTimeout((function() {
			getListOfSpecsToBuild();
		}), delay * 1000);
	}
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
			fs.writeFileSync(deployment.INDEX_HTML, indexHtml);
		} catch (ex) {
			console.log("Could not save " + deployment.INDEX_HTML);
		}

		indexHtml = null;
	}

	if (thisBuildTime != null) {
		lastRun = thisBuildTime;

		try {
			fs.writeFileSync(deployment.LAST_RUN_FILE, lastRun.format(DATE_FORMAT));
		} catch (ex) {
			console.log("Could not save " + deployment.LAST_RUN_FILE);
		}

		diff = moment().unix() - thisBuildTime.unix();
	} else {
		// See if the last run file exists
		try {
			var stats = fs.lstatSync(deployment.LAST_RUN_FILE);
			if (stats.isFile()) {
				lastRun = moment(fs.readFileSync(deployment.LAST_RUN_FILE).toString().replace(/\n/g, ""));
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
	contentSpecRESTCallFailed = false;
	topicRESTCallFailed = false;
	var updatedSpecs = new set([]);
	var allSpecs = [];

	/*
		Make a note of when we started this run.
	 */
	thisBuildTime = moment();

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
	try {
        fs.readdir(dir, function (error, list) {
            if (error) {
                return done(error);
            }

            var i = 0;

            (function next (latest, latestFile, allFiles) {
                var file = list[i++];
                var fullFile = dir + '/' + file;

                if (!file) {
                    /*
                        Clear out any old files
                     */

                    var latestFilePath = dir + '/' + latestFile;

                    for (var allFilesIndex = 0, allFilesCount = allFiles.length; allFilesIndex < allFilesCount; ++allFilesIndex) {
                        var bookFile = allFiles[allFilesIndex];
                        if (bookFile.path != latestFilePath &&
                            bookFile.modified.isBefore(moment().subtract(1, 'd'))) {
                            fs.unlinkSync(bookFile.path);
                        }
                    }

                    return done(null, latest, latestFile);
                }

                if (file.toString().match(filter)) {
                    fs.stat(fullFile, function (error, stat) {
                        if (error) {
                            next(latest, latestFile, allFiles);
                        } else {
                            if (stat && stat.isDirectory()) {
                                walk(file, function (error) {
                                    next(latest, latestFile, allFiles);
                                });
                            } else {
                                var lastModified = moment(stat.mtime);
                                allFiles.push({path: fullFile, modified: lastModified});

                                if (!latest || lastModified.isAfter(latest)) {
                                    latest = lastModified;
                                    latestFile = file;
                                }

                                next(latest, latestFile, allFiles);
                            }
                        }
                    });
                } else {
                    next(latest, latestFile, allFiles);
                }
            })(null, null, []);
        });
    } catch (ex) {
        return done(ex);
    }
};

getListOfSpecsToBuild();

