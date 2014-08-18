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

"use strict";

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

/**
 * This value holds the pre loaded server entity configuration
 *
 * @type {object}
 */
var serverEntities;

/**
 * The count of the number of child processes
 * @type {number}
 */
var childCount = 0;


/**
 * Finish processing builds the for a specific locale.
 *
 * @param locale The locale to finish processing for
 * @param data
 */
function finishProcessingForLocale(locale, data) {
    util.log("Finished building " + locale + " books");

    if (data != null) {
        data += "];";

        var localeDir = config.HTML_DIR + "/" + locale;
        var dataJsFile = localeDir + "/data.js";

        try {
            // Make sure the locale directory exists
            if (!fs.existsSync(localeDir)) {
                fs.mkdirSync(localeDir, "0755");
            }

            // Save the data.js file
            fs.writeFileSync(dataJsFile, data);
        } catch (ex) {
            util.error("Could not save " + dataJsFile);
            util.error(ex);
        }
    }
}

function processNextSpec(data, specs, locale, publicanLocale, doneCallback) {
    if (specs.length != 0) {
        // If there are still specs to be processed, then process them
        processSpecs(data, specs, locale, publicanLocale, doneCallback);
    } else if (childCount == 0) {
        // Finish the processing
        finishProcessingForLocale(locale, data);

        // Build the books for the next locale
        doneCallback();
    }
}

/**
 * Start MAX_TRANSLATION_PROCESSES (or specs..length if that is less) processes, with each recursive call
 * starting another process until all the specs have been built.
 * @param specs
 */
function processSpecs(data, specs, locale, publicanLocale, doneCallback) {
    var processCount = specs.length < (config.MAX_TRANSLATION_PROCESSES - childCount) ? specs.length : (config.MAX_TRANSLATION_PROCESSES - childCount);
    for (var processIndex = 0; processIndex < processCount; ++processIndex) {
        var specId = specs.pop();
        ++childCount;

        util.log("Starting build of book " + locale + "-" + specId + " (" + specs.length + " specs remain)");

        // Download the spec details from the server
        var contentSpecQuery = config.REST_SERVER + "1/contentspec/get/json+text/" + specId;
        jQuery.getJSON(contentSpecQuery,
            function(id) {
                return function(contentSpec) {
                    var specDetails = {
                        title: contentSpec.title,
                        product: contentSpec.product,
                        version: contentSpec.version
                    };

                    // Run the external build script
                    exec(config.BUILD_TRANSLATED_BOOK_SCRIPT + " " + locale + id + " " + locale + "=" + publicanLocale + "=" + id,
                        function(error, stdout, stderr) {
                            --childCount;

                            util.log("Finished build of book " + locale + "-" + id);

                            // Get the current time
                            var time = moment();

                            // Save the last build time for the spec
                            buildUtils.writeLastBuildTime(time, config.DATA_DIR + locale + "/" + id);

                            // Delete any old zip files
                            var publicanZIPDir = constants.PUBLICAN_BOOK_ZIPS_COMPLETE + "/" + locale;
                            buildUtils.deleteAllFilesOlderThanADay(publicanZIPDir, locale + "-" + id + ".*?.zip", function() {});

                            // Get the latest ZIP filename
                            buildUtils.getLatestFile(publicanZIPDir, locale + "-" + id + ".*?\\.zip", function(error, date, filename) {
                                var zipFileName = filename == null ? "" : filename;

                                // Get the pdf filename
                                buildUtils.getLatestFile(config.HTML_DIR + "/" + locale + "/" + id + "/", ".*?\\.pdf", function(error, date, filename) {
                                    // Build and add the entry for data,js
                                    data += buildUtils.buildSpecDataJsEntry(id, specDetails, zipFileName, time.format(constants.DATE_FORMAT), locale, filename);

                                    if (childCount < config.MAX_PROCESSES) {
                                        processNextSpec(data, specs, locale, publicanLocale, doneCallback);
                                    }
                                });
                            });
                        });
                }
            }(specId)).error(function(jqXHR, textStatus, errorThrown) {
                util.error("Call to " + contentSpecQuery + " failed!");
                util.error(errorThrown);

                // Move onto the next spec
                processNextSpec(data, specs, locale, publicanLocale, doneCallback);
            });
    }
}

/**
 * Build all the translation books for a specific locale and exit when locales have been processed.
 *
 * @param localeIndex
 * @param locales
 * @param localeToSpecMap
 */
function buildBooks(localeIndex, locales, localeToSpecMap) {
    if (localeIndex < locales.length) {
        var localeId = locales[localeIndex][0];
        var localeInfo = locales[localeIndex][1];
        var locale = localeInfo.value;
        var publicanLocale = localeInfo.buildValue;

        // Make sure the lang data dir exists
        var localeDataDir = config.DATA_DIR + locale;
        try {
            if (!fs.existsSync(localeDataDir)) {
                fs.mkdirSync(localeDataDir);
            }
        } catch (ex) {
            util.error("Could not create directory " + localeDataDir);
        }

        var specs = localeToSpecMap[localeId];
        util.log("Found " + specs.length + " content specs for " + locale);

        // If there are no specs move onto the next locale
        if (specs.length > 0) {
            util.log("Starting to build " + locale + " books");

            var data = buildUtils.buildBaseDataJs();
            processSpecs(data, specs, locale, publicanLocale, function() {
                buildBooks(++localeIndex, locales, localeToSpecMap);
            });
        } else {
            buildBooks(++localeIndex, locales, localeToSpecMap);
        }
    } else {
        // The build has finished, so exit
        process.exit(0);
    }
}

function sortByLocalValue(a, b) {
    a = a[1];
    b = b[1];

    if (!a.value && b.value) {
        return -1;
    }

    if (a.value && !b.value) {
        return 0;
    }

    if (a.value.toLowerCase() < b.value.toLowerCase()) {
        return -1;
    }

    if (a.value.toLowerCase() > b.value.toLowerCase()) {
        return 1;
    }

    return 0;
}

/**
 * Downloads a list of content specs that need to be built and starts building them.
 */
function getContentSpecsToBuild() {
    var query = config.REST_SERVER + "1/contentspecs/get/json/query;translationEnabled=true?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22contentSpecs%22%7D%2C%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%22translationDetails%22%7D%2C%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22locales%22%7D%7D%2C%7B%22trunk%22%3A%7B%22name%22%3A%20%22translationServer%22%7D%7D%5D%7D%5D%7D%5D%7D";

    jQuery.getJSON(query,
        function(data) {
            var contentSpecs = data.items;
            var localeToContentSpec = {};
            var locales = {};

            // Print a message about how specs need to be built
            util.log("Found " + contentSpecs.length + " content specs");

            // Iterate over the specs and extract the locales to build in
            for (var i = 0; i < contentSpecs.length; i++) {
                var contentSpec = contentSpecs[i].item;
                var translationDetails = contentSpec.translationDetails;

                if (translationDetails && translationDetails.locales) {
                    var localeItems = translationDetails.locales.items;

                    for (var j = 0; j < localeItems.length; j++) {
                        var locale = localeItems[j].item;

                        // Add the content spec entry for the locale
                        if (!(locale.id in locales)) {
                            locales[locale.id] = locale;
                            localeToContentSpec[locale.id] = [];
                        }
                        localeToContentSpec[locale.id].push(contentSpec.id);
                    }
                } else {
                    util.error("contentSpec.translationDetails.locales was not expected to be null");
                }
            }

            // Build the locale list and sort it
            var fixedLocales = [];
            for (var key in locales) {
                fixedLocales.push([key, locales[key]]);
            }
            fixedLocales.sort(sortByLocalValue);

            // Start building
            buildBooks(0, fixedLocales, localeToContentSpec);
        }).error(function(jqXHR, textStatus, errorThrown) {
            util.error("Call to " + query + " failed!");
        });
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
            getContentSpecsToBuild();
        }).error(function(jqXHR, textStatus, errorThrown) {
            util.error("Call to " + settingsUrl + " failed!");
        });
}

initAndGo();