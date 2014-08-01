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

// NOTE this is a temporary variable and will eventually be moved to load the details from the server
var LOCALES = [
    {"lang": "ja", "publicanLang": "ja-JP"},
    {"lang": "fr", "publicanLang": "de-DE"},
    {"lang": "pt-BR", "publicanLang": "pt-BR"},
    {"lang": "de", "publicanLang": "de-DE"},
    {"lang": "es", "publicanLang": "es-ES"},
    {"lang": "zh-Hans", "publicanLang": "zh-CN"},
    {"lang": "it", "publicanLang": "it-IT"},
    {"lang": "ko", "publicanLang": "ko-KR"},
    {"lang": "ru", "publicanLang": "ru-RU"},
    {"lang": "zh-TW", "publicanLang": "zh-TW"}
];

// NOTE this is a temporary variable and will eventually be moved to load the details from the server
var TRANSLATION_DIR = "/home/pressgang/translations/";

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

function getSpecsFromFile(filename) {
    var specs = [];
    try {
        var fileContent = fs.readFileSync(filename).toString();

        var lines = fileContent.split(/\r?\n/g);
        for (var count = 0; count < lines.length; count++) {
            var line = lines[count].trim();
            if (line.match(/^\d+$/)) {
                specs.push(line);
            }
        }
    } catch (ex) {
        util.error("Failed to read specs from " + filename);
    }

    return specs;
}

/**
 * Start MAX_TRANSLATION_PROCESSES (or specs..length if that is less) processes, with each recursive call
 * starting another process until all the specs have been built.
 * @param specs
 */
function processSpecs(data, localeIndex, specs, locale, publicanLocale) {
    var processCount = specs.length < (config.MAX_TRANSLATION_PROCESSES - childCount) ? specs.length : (config.MAX_TRANSLATION_PROCESSES - childCount);
    for (var processIndex = 0; processIndex < processCount; ++processIndex) {
        var specId = specs.pop();
        ++childCount;

        util.log("Starting build of book " + locale + "-" + specId + " (" + specs.length + " specs remain)");

        // Download the spec details from the server
        var contentSpecQuery = config.REST_SERVER + "/1/contentspec/get/json+text/" + specId;
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
                                    data += buildUtils.buildSpecDataJsEntry(specId, specDetails, zipFileName, time.format(constants.DATE_FORMAT), locale, filename);

                                    if (childCount < config.MAX_PROCESSES) {
                                        if (specs.length != 0) {
                                            // If there are still specs to be processed, then process them
                                            processSpecs(data, localeIndex, specs, locale, publicanLocale);
                                        } else if (childCount == 0) {
                                            // Finish the processing
                                            finishProcessingForLocale(locale, data);

                                            // Build the books for the next locale
                                            buildBooksForLocale(++localeIndex);
                                        }
                                    }
                                });
                            });
                        });
                }
            }(specId)).error(function(jqXHR, textStatus, errorThrown) {
                util.error("Call to " + contentSpecQuery + " failed!");
                util.error(errorThrown);
            });
    }
}

/**
 * Build all the translation books for a specific locale and exit when locales have been processed.
 *
 * @param localeIndex
 */
function buildBooksForLocale(localeIndex) {
    if (localeIndex < LOCALES.length) {
        var localeInfo = LOCALES[localeIndex];
        var locale = localeInfo.lang;
        var publicanLocale = localeInfo.publicanLang;
        var specs = getSpecsFromFile(TRANSLATION_DIR + locale + ".txt");
        util.log("Found " + specs.length + " content specs for " + locale);

        // If there are no specs move onto the next locale
        if (specs.length > 0) {
            util.log("Starting to build " + locale + " books");

            var data = buildUtils.buildBaseDataJs();
            processSpecs(data, localeIndex, specs, locale, publicanLocale);
        } else {
            buildBooksForLocale(++localeIndex);
        }
    } else {
        // The build has finished, so exit
        process.exit(0);
    }
}

/**
 * Initialises the application and starts processing builds
 */
function initAndGo() {
    var settingsUrl = config.REST_SERVER + "/1/settings/get/json";
    jQuery.getJSON(settingsUrl,
        function(data) {
            // Save the server entities, so we can use it later.
            serverEntities = data.entities;

            // Write the sites configuration
            buildUtils.writeSiteConfig(serverEntities);

            // Get the list of books to build and start building
            buildBooksForLocale(0);
        }).error(function(jqXHR, textStatus, errorThrown) {
            util.error("Call to " + settingsUrl + " failed!");
        });
}

initAndGo();