/*
 * Copyright 2011-2014 Red Hat, Inc.
 *
 * This file is part of PressGang CCMS.
 *
 * PressGang CCMS is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * PressGang CCMS is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with PressGang CCMS. If not, see <http://www.gnu.org/licenses/>.
 */

var constants = require('./src/constants.js');
var config = require("./src/config.js");
var buildUtils = require('./src/utils.js');

var fs = require('fs');
var set = require('collections/sorted-set.js');
var iterator = require("collections/iterator");
var jQuery = require("jquery");
var moment = require('moment');
var exec = require('child_process').exec;
var util = require('util');

/*
 * This application is designed to be asynchronous. It performs the following steps:
 * 1. Get all the topics and specs that have been modified since the supplied date. This involves two asynchronous
 *    REST calls.
 * 2. Rebuild each spec (through an external script, but this may be merged into this code in future). We will launch
 *    MAX_PROCESSES asynchronous scripts to run csprocessor/publican to build the spec.
 * 3. Save the index.html page and start again.
 *
 * In the background we are also pulling down the details of specs that are new or modified
 * since the last run (so for the first run all specs will be new). This may mean that the
 * index.html page has some "To be synced" info for the title, product and version, but the benefit
 * is that we are not waiting for this info before rebuilding the new specs.
 *
 * And once the first run through is done, it is unlikely that the product, version or title will change,
 * so there is little downside to having this information being slightly out of sync.
 */


/**
 * This value holds the pre loaded server entity configuration
 *
 * @type {object}
 */
var serverEntities;
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
 * @type {string}
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
 * @type {SortedSet}
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
 * Start MAX_PROCESSES (or updatedSpecs.length if that is less) processes, with each recursive call
 * starting another process until all the specs have been built.
 * @param updatedSpecs
 */
function processSpecs(updatedSpecs) {
    var makeBuildCompleteFunction = function(id) {
        return function(error, stdout, stderr) {
            --childCount;

            util.log("Finished build of modified book " + id);

            // Add the style, scripts and constants required to build the side menu
            var scriptFiles = "\
                                <script type='application/javascript'>\n\
                                    var SPEC_ID = " + id + ";\n\
                                </script>\n\
                                <script type='application/javascript' src='/config.js'></script>\n\
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
                                <script type='application/javascript' src='" + config.PRESSGANG_WEBSITE_JS_URL + "' async></script>\n\
                                </body>\n\
                                </html>";

            var styleFiles = "<head>\n\
                        <link href='/lib/docbuilder-overlay/css/pressgang.css' rel='stylesheet'>\n\
                        <link href='/lib/docbuilder-overlay/css/style.css' rel='stylesheet'>\n\
                        <link href='/lib/bootstrap/css/bootstrap.min.css' rel='stylesheet'>\n";

            // Append the custom javascript files to the index.html
            var contents;
            try {
                contents = fs.readFileSync(config.HTML_DIR + "/" + id + "/index.html").toString();
                contents = contents.replace("<head>", styleFiles);
                contents = contents.replace("</body></html>", scriptFiles);
                fs.writeFileSync(config.HTML_DIR + "/" + id + "/index.html", contents);
            } catch (ex) {
                util.error("Could not edit and save main HTML file for " + id);
            }

            try {
                contents = fs.readFileSync(config.HTML_DIR + "/" + id + "/remarks/index.html").toString();
                contents = contents.replace("<head>", styleFiles);
                contents = contents.replace("</body></html>", scriptFiles);
                fs.writeFileSync(config.HTML_DIR + "/" + id + "/remarks/index.html", contents);
            } catch (ex) {
                util.error("Could not edit and save remarks HTML file for " + id);
            }

            // Delete any old zip files
            buildUtils.deleteAllFilesOlderThanADay(constants.PUBLICAN_BOOK_ZIPS_COMPLETE, id + ".*?.zip", function() {});

            if (childCount < config.MAX_PROCESSES) {

                if (updatedSpecs.length !== 0) {
                    /*
                     If there are still specs to be processed, then process them
                     */
                    processSpecs(updatedSpecs);
                } else if (childCount === 0) {
                    var runTimeSeconds = moment().unix() - thisBuildTime.unix();
                    var delay = config.DELAY_WHEN_NO_UPDATES - runTimeSeconds;

                    if (delay <= 0) {
                        getListOfSpecsToBuild();
                    } else {
                        util.log("Delaying for " + delay + " seconds");

                        setTimeout((function() {
                            getListOfSpecsToBuild();
                        }), delay * 1000);
                    }
                }
            }
        };
    };

    if (updatedSpecs.length === 0) {
        // There were no specs to build, so start again after a short delay
        util.log("Delaying for " + config.DELAY_WHEN_NO_UPDATES + " seconds");
        setTimeout((function() {
            getListOfSpecsToBuild();
        }), config.DELAY_WHEN_NO_UPDATES * 1000);
    } else {
        var processCount = updatedSpecs.length < (config.MAX_PROCESSES - childCount) ? updatedSpecs.length : (config.MAX_PROCESSES - childCount);
        for (var processIndex = 0; processIndex < processCount; ++processIndex) {
            var specId = updatedSpecs.pop();
            ++childCount;

            util.log("Starting build of modified book " + specId + " (" + updatedSpecs.length + " specs remain)");

            exec(config.BUILD_BOOK_SCRIPT + " " + specId + " " + specId, makeBuildCompleteFunction(specId));
        }
    }
}

/**
 * Called when the modified topics and specs have been found. Once both
 * functions have called this function, the process of actually building the
 * books will start.
 */
function buildBooks(updatedSpecs, allSpecsArray) {
    // Build the initial data.js file
    data = buildUtils.buildBaseDataJs(diff);

    var finishProcessing = function() {
        data += "];";

        processSpecs(updatedSpecs);
    };

    var processSpecDetails = function(processIndex) {
        if (processIndex > allSpecsArray.length) {
            util.error("Error: processIndex > allSpecsArray.length");
            return;
        }

        if (processIndex == allSpecsArray.length) {
            finishProcessing();
        } else {
            var specId = allSpecsArray[processIndex];

            buildUtils.getLatestFile(constants.PUBLICAN_BOOK_ZIPS_COMPLETE, specId + ".*?\\.zip", function(error, date, filename) {
                var zipFileName = filename === null ? "" : filename;

                var fixedSpecDetails = specDetailsCache[specId] ?
                {
                    title: specDetailsCache[specId].title ? specDetailsCache[specId].title.replace(/'/g, "\\'") : "",
                    version: specDetailsCache[specId].version ? specDetailsCache[specId].version.replace(/'/g, "\\'") : "",
                    product: specDetailsCache[specId].product ? specDetailsCache[specId].product.replace(/'/g, "\\'") : "",
                    tags: specDetailsCache[specId].tags ? specDetailsCache[specId].tags : []
                } : constants.DEFAULT_SPEC_DETAILS;

                /*
                 We can use the file name of the publican zip file to determine when this book was last built. We do
                 need to clean up the time stamp though so moment.js will recognise it.
                 */
                var lastCompileTime = null;
                var lastBuildMatch = /\d+ ((\d{4}\-\d{2}\-\d{2}T)( )?(\d{1,2})(:\d{1,2}:\d{2}\.\d{3}[\+\-]\d{4})).zip/.exec(zipFileName);
                if (lastBuildMatch) {
                    lastCompileTime = lastBuildMatch[1];
                }

                // Build and add the entry for data,js
                data += buildUtils.buildSpecDataJsEntry(specId, fixedSpecDetails, zipFileName, lastCompileTime);

                processSpecDetails(++processIndex);
            });
        }
    };

    processSpecDetails(0);
}

/**
 * If there was a failure with a rest call, this function will be called, which
 * will start again as if this was the first run.
 */
function restartAfterFailure() {
    var runTimeSeconds = moment().unix() - thisBuildTime.unix();
    var delay = config.DELAY_WHEN_NO_UPDATES - runTimeSeconds;

    thisBuildTime = null;

    if (delay <= 0) {
        getListOfSpecsToBuild();
    } else {

        util.log("Delaying for " + delay + " seconds");

        setTimeout((function() {
            getListOfSpecsToBuild();
        }), delay * 1000);
    }
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
 * This function will be called recursively until the details for the specs are updated.
 */
function processPendingSpecUpdates() {
    processingPendingCacheUpdates = true;

    if (pendingSpecCacheUpdates.length !== 0) {
        var specId = pendingSpecCacheUpdates.pop();

        var specDetailsQuery = config.REST_SERVER + "1/contentspec/get/json+text/" + specId + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22tags%22%7D%7D%5D%7D";

        if (!specDetailsCache[specId]) {
            specDetailsCache[specId] = {};
        }

        util.log("Filling spec cache. " + pendingSpecCacheUpdates.length + " calls to be made.");

        jQuery.getJSON(specDetailsQuery,
            function(data) {
                // Set the base data
                specDetailsCache[specId].title = data.title;
                specDetailsCache[specId].product = data.product;
                specDetailsCache[specId].version = data.version;

                if (data.tags) {
                    specDetailsCache[specId].tags = [];

                    for (var i = 0, count = data.tags.items.length; i < count; ++i) {
                        var tag = data.tags.items[i].item;
                        specDetailsCache[specId].tags.push(tag.id);
                    }
                }

                processPendingSpecUpdates();
            }).error(function(jqXHR, textStatus, errorThrown) {
                util.error("Call to " + specDetailsQuery + " failed!");
                processPendingSpecUpdates();
            });

    } else {
        processingPendingCacheUpdates = false;
    }
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

    var topicQuery = config.REST_SERVER + "1/topics/get/json/query;";

    // If we have some last run info, use that to limit the search
    topicQuery += "startEditDate=" + encodeURIComponent(encodeURIComponent(lastRun.format(constants.DATE_FORMAT)));
    topicQuery += "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22topics%22%7D%7D%5D%7D%0A%0A";

    //util.log("Getting modified topics from URL " + topicQuery);
    util.log("Finding modified topics");

    var contentSpecsForModifiedTopics = function(lastRun, updatedSpecs, allSpecsArray, modifiedTopics) {
        // Get the csnodes for the topics to see if the are frozen
        var csNodeQuery = config.REST_SERVER + "1/contentspecnodes/get/json/query;";

        // Get the topic ids
        var topicIds = [];
        for (var topicIndex = 0, topicCount = modifiedTopics.length; topicIndex < topicCount; ++topicIndex) {
            var topic = modifiedTopics[topicIndex].item;
            topicIds.push(topic.id);
        }

        // Build up the query
        csNodeQuery += "csNodeEntityIds=" + topicIds.join(",");
        csNodeQuery += ";csNodeInfoTopicIds=" + topicIds.join(",");
        csNodeQuery += ";logic=Or";
        csNodeQuery += "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22nodes%22%7D%2C%20%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22contentSpec%22%7D%7D%2C%7B%22trunk%22%3A%7B%22name%22%3A%20%22infoTopicNode%22%7D%7D%5D%7D%5D%7D";

        jQuery.getJSON(csNodeQuery,
            function(data) {
                if (data.items) {
                    for (var csNodeIndex = 0, topicCount = data.items.length; csNodeIndex < topicCount; ++csNodeIndex) {
                        var csNode = data.items[csNodeIndex].item;
                        if (csNode.contentSpec) {
                            if (csNode.infoTopicNode && csNode.infoTopicNode.topicRevision === null) {
                                // An info topic node has been modified
                                updatedSpecs.add(csNode.contentSpec.id);
                            } else if (csNode.entityRevision === null) {
                                // A topic node has been modified
                                updatedSpecs.add(csNode.contentSpec.id);
                            }
                        } else {
                            util.log("csNode.contentSpec was not expected to be null");
                        }
                    }
                } else {
                    util.log("data.items was not expected to be null");
                }

                topicsProcessed = true;
                routeAfterRESTCalls(updatedSpecs, allSpecsArray);
            }).error(function(jqXHR, textStatus, errorThrown) {
                util.error("Call to " + csNodeQuery + " failed!");
                util.error(errorThrown);
                topicRESTCallFailed = true;
                routeAfterRESTCalls();
            });
    };

    jQuery.getJSON(topicQuery,
        function(data) {
            if (data.items) {
                util.log("Found " + data.items.length + " modified topics.");

                if (data.items.length > 0) {
                    contentSpecsForModifiedTopics(lastRun, updatedSpecs, allSpecsArray, data.items);
                } else {
                    // Nothing to process so continue as per normal
                    topicsProcessed = true;
                    routeAfterRESTCalls(updatedSpecs, allSpecsArray);
                }
            } else {
                util.log("data.items was not expected to be null");

                topicsProcessed = true;
                routeAfterRESTCalls(updatedSpecs, allSpecsArray);
            }
        }).error(function(jqXHR, textStatus, errorThrown) {
            util.error("Call to " + topicQuery + " failed!");
            util.error(errorThrown);
            topicRESTCallFailed = true;
            routeAfterRESTCalls();
        });
}

/**
 * Query the server for all specs that have been modified since the specified time
 * @param lastRun The time DocBuilder was last run
 */
function getSpecs(lastRun, updatedSpecs, allSpecsArray) {

    var specQuery = config.REST_SERVER + "1/contentspecs/get/json/query;?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22contentSpecs%22%7D%7D%5D%7D";

    //util.log("Getting specs from URL " + specQuery);
    util.log("Finding content specs");

    jQuery.getJSON(specQuery,
        function(data) {
            if (data.items) {

                util.log("Found " + data.items.length + " content specs");

                for (var specIndex = 0, specCount = data.items.length; specIndex < specCount; ++specIndex) {
                    var spec = data.items[specIndex].item;

                    // We haven't processed this spec yet
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

                util.log("Found " + updatedSpecs.length + " modified content specs");
            } else {
                util.error("data.items was not expected to be null");
            }

            specsProcessed = true;
            routeAfterRESTCalls(updatedSpecs, allSpecsArray);
        }).error(function(jqXHR, textStatus, errorThrown) {
            util.error("Call to " + specQuery + " failed!");
            util.error(errorThrown);
            contentSpecRESTCallFailed = true;
            routeAfterRESTCalls();
        });
}

/**
 * Reads a file that holds the time DocBuilder last did a build, and then
 * finds the modified specs and topics.
 */
function getListOfSpecsToBuild() {
    var lastRun = null;

    if (data !== null) {
        var dataJsFile = config.HTML_DIR + "/data.js";

        // Save the data.js file
        try {
            fs.writeFileSync(dataJsFile, data);
        } catch (ex) {
            util.error("Could not save " + dataJsFile);
        }

        data = null;
    }

    if (thisBuildTime !== null) {
        lastRun = thisBuildTime;
        diff = moment().unix() - thisBuildTime.unix();

        // Save the last build time to file
        buildUtils.writeLastBuildTime(lastRun, constants.LAST_RUN_FILE);
    } else {
        // See if the last run file exists
        lastRun = buildUtils.getLastBuildTime(constants.LAST_RUN_FILE);
    }

    // Reset the variables for this run.
    topicsProcessed = false;
    specsProcessed = false;
    contentSpecRESTCallFailed = false;
    topicRESTCallFailed = false;
    var updatedSpecs = new set([]);
    var allSpecs = [];

    // Make a note of when we started this run.
    thisBuildTime = moment();

    getModifiedTopics(lastRun, updatedSpecs, allSpecs);
    getSpecs(lastRun, updatedSpecs, allSpecs);
}

/**
 * Initialises the application and starts processing builds
 */
function initAndGo() {
    // Validate that the config contains the bare minimum
    buildUtils.validateConfig(config);

    // Fix up the config
    buildUtils.fixAndApplyDefaultsToConfig(config);

    var settingsUrl = config.REST_SERVER + "1/settings/get/json";
    jQuery.getJSON(settingsUrl,
        function(data) {
            // Save the server entities, so we can use it later.
            serverEntities = data.entities;

            // Write the sites configuration
            buildUtils.writeSiteConfig(serverEntities);

            // Get the list of books to build and start building
            getListOfSpecsToBuild();
        }).error(function(jqXHR, textStatus, errorThrown) {
            util.error("Call to " + settingsUrl + " failed!");
        });
}

initAndGo();