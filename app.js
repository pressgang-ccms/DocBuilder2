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
 * The REST server that the DocBuilder will connect to.
 * @type {string}
 */
var FIXED_UI_URL = "http://" + deployment.BASE_SERVER + "/" + deployment.UI_URL + "#ContentSpecFilteredResultsAndContentSpecView";

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
var BUILD_BOOK_SCRIPT = __dirname + "/build_original_books.sh";
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
 * A placeholder to be used when the details of the spec have not yet been downloaded
 * @type {string}
 */
var TO_BE_SYNCED_LABEL = "To Be Synced";

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
 * The javascript file containing the info on specs
 * @type {null}
 */
var data = null;
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

    data = "var buildTime = " + diff + ";\n\
        var OPEN_LINK_ID_REPLACE = '" + deployment.OPEN_LINK_ID_REPLACE + "';\n\
        var OPEN_LINK_LOCALE_REPLACE = '" + deployment.OPEN_LINK_LOCALE_REPLACE + "';\n\
        var TO_BE_SYNCED_LABEL = '" + TO_BE_SYNCED_LABEL + "';\n\
        var EDIT_LINK = '" + deployment.EDIT_LINK + "';\n\
        var BASE_SERVER = '" + deployment.BASE_SERVER + "';\n\
        var OPEN_LINK = '" + deployment.OPEN_LINK + "';\n\
        var UI_URL = '" + deployment.UI_URL + "';\n\
        var data = [";

	var finishProcessing = function() {
        data += "];\n\
            jQuery(function() {filterData(data)});";

		processSpecs(updatedSpecs);
	}

	var processSpecDetails = function(processIndex) {
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
					title: TO_BE_SYNCED_LABEL,
					version: TO_BE_SYNCED_LABEL,
					product: TO_BE_SYNCED_LABEL,
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

                var obsoleteLabel = isObsolete ? "Unobsolete" : "Obsolete";

                var freezeElement;
                if (isFrozen) {
                    freezeElement = "'<div>Frozen</div>'";
                } else {
                    freezeElement = "'<button onclick=\"javascript:freezeSpec(\\'" + FIXED_UI_URL + "\\', " + specId + ")\">Freeze</button>'";
                }

                data += "{\n\
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
                    status: '<div style=\"width: 32px; height: 32px; background-image: " + image + "; background-size: cover\"/>',\n\
                    freeze: " + freezeElement + ",\n\
                    obsolete: '<button onclick=\"javascript:obsoleteSpec(" + isObsolete + ", \\'" + REST_SERVER + "\\', " + specId + ")\">" + obsoleteLabel + "</button>'\n\
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
                                    var SPEC_ID = " + id + ";\n\
                                </script>\n\
                                <script type='application/javascript' src='/lib/jquery/jquery-2.1.1.min.js'></script>\n\
                                <script type='application/javascript' src='/lib/moment/moment-with-langs.js'></script>\n\
                                <script type='application/javascript' src='/lib/bootstrap/js/bootstrap.min.js'></script>\n\
                                <script type='application/javascript' src='/lib/bootbox/bootbox.min.js'></script>\n\
                                <script type='application/javascript' src='/lib/raphael/raphael-min.js'></script>\n\
                                <script type='application/javascript' src='/lib/raphael/pie.js'></script>\n\
                                <script type='application/javascript' src='/lib/typo/typo_proto.js'></script>\n\
                                <script type='application/javascript' src='/lib/typo/typo.js'></script>\n\
                                <script type='application/javascript' src='/lib/async/async.js'></script>\n\
                                <script type='application/javascript' src='/lib/docbuilder-overlay/javascript/overlay.js'></script>\n\
                                <script type='application/javascript' src='/lib/docbuilder-overlay/javascript/pressgang_websites.js'></script>\n\
                                <script type='application/javascript' src='http://docbuilder.usersys.redhat.com/13968/html/files/pressgang_website.js' async></script>\n\
                                </body>\n\
								</html>";

					var styleFiles = "<head>\n\
						<link href='/lib/docbuilder-overlay/css/pressgang.css' rel='stylesheet'>\n\
						<link href='/lib/docbuilder-overlay/css/style.css' rel='stylesheet'>\n\
                        <link href='/lib/bootstrap/css/bootstrap.min.css' rel='stylesheet'>\n";

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
    topicQuery += "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22topics%22%7D%7D%5D%7D%0A%0A";

	//console.log("Getting modified topics from URL " + topicQuery);
	console.log("Finding modified topics");

    var contentSpecsForModifiedTopics = function(lastRun, updatedSpecs, allSpecsArray, modifiedTopics) {
        // Get the csnodes for the topics to see if the are frozen
        var csNodeQuery = REST_SERVER + "/1/contentspecnodes/get/json/query;";

        // Get the topic ids
        var topicIds = []
        for (var topicIndex = 0, topicCount = modifiedTopics.length; topicIndex < topicCount; ++topicIndex) {
            var topic = modifiedTopics[topicIndex].item;
            topicIds.push(topic.id);
        }

        // Build up the query
        csNodeQuery += "csNodeEntityIds=" + topicIds.join(",");
        csNodeQuery += ";csNodeInfoTopicIds=" + topicIds.join(",");
        csNodeQuery += ";logic=Or"
        csNodeQuery += "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22nodes%22%7D%2C%20%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22contentSpec%22%7D%7D%2C%7B%22trunk%22%3A%7B%22name%22%3A%20%22infoTopicNode%22%7D%7D%5D%7D%5D%7D";

        $.getJSON(csNodeQuery,
            function(data) {
                if (data.items) {
                    for (var csNodeIndex = 0, topicCount = data.items.length; csNodeIndex < topicCount; ++csNodeIndex) {
                        var csNode = data.items[csNodeIndex].item;
                        if (csNode.contentSpec) {
                            if (csNode.infoTopicNode && csNode.infoTopicNode.topicRevision == null) {
                                // An info topic node has been modified
                                updatedSpecs.add(csNode.contentSpec.id);
                            } else if (csNode.entityRevision == null) {
                                // A topic node has been modified
                                updatedSpecs.add(csNode.contentSpec.id);
                            }
                        } else {
                            console.log("csNode.contentSpec was not expected to be null");
                        }
                    }
                } else {
                    console.log("data.items was not expected to be null");
                }

                topicsProcessed = true;
                routeAfterRESTCalls(updatedSpecs, allSpecsArray);
            }).error(function(jqXHR, textStatus, errorThrown) {
                console.log("Call to " + csNodeQuery + " failed!");
                console.log(errorThrown);
                topicRESTCallFailed = true;
                routeAfterRESTCalls();
            });
    }

    $.getJSON(topicQuery,
        function(data) {
            if (data.items) {
                console.log("Found " + data.items.length + " modified topics.");

                if (data.items.length > 0) {
                    contentSpecsForModifiedTopics(lastRun, updatedSpecs, allSpecsArray, data.items);
                } else {
                    // Nothing to process so continue as per normal
                    topicsProcessed = true;
                    routeAfterRESTCalls(updatedSpecs, allSpecsArray);
                }
            } else {
                console.log("data.items was not expected to be null");

                topicsProcessed = true;
                routeAfterRESTCalls(updatedSpecs, allSpecsArray);
            }
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

    if (data != null) {
        /*
         Save the index.html file
         */
        try {
            fs.writeFileSync(deployment.DATA_JS, data);
        } catch (ex) {
            console.log("Could not save " + deployment.DATA_JS);
        }

        data = null;
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

