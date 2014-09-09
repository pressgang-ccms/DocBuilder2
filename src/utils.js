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

var constants = require('./constants.js');
var config = require("./config.js");

var fs = require('fs');
var jQuery = require("jquery");
var moment = require('moment');
var util = require('util');
var url = require('url');
var os = require('os');

function endsWith(str, suffix){
    return str.slice(-suffix.length) == suffix;
};

function startsWith(str, prefix){
    return str.slice(0, prefix.length) == prefix;
};

/**
 * Calls the done function with the filename and last modified date of the file that was most recently modified
 * @param dir    The directory to search
 * @param filter The format that the file names have to match to be considered
 * @param done   A function to call when the latest file is found
 */
exports.getLatestFile = function(dir, filter, done) {
    try {
        fs.readdir(dir, function (error, list) {
            if (error) {
                return done(error);
            }

            // Collect the files that match the filter
            _next(dir, filter, 0, list,  null, null, [], function(latest, latestFile, allMatchingFiles) {
                return done(null, latest, latestFile);
            });
        });
    } catch (ex) {
        return done(ex);
    }
};

/**
 * Deletes all files that are older than a day and then calls the done function
 *
 * @param dir    The directory to search
 * @param filter The format that the file names have to match to be considered
 * @param done   A function to call when all files older than a day have been deleted
 */
exports.deleteAllFilesOlderThanADay = function(dir, filter, done) {
    try {
        fs.readdir(dir, function (error, list) {
            if (error) {
                return done(error);
            }

            // Collect the files that match the filter
            _next(dir, filter, 0, list,  null, null, [], function(latest, latestFile, allMatchingFiles) {
                /*
                 Clear out any old files
                 */
                var latestFilePath = dir + '/' + latestFile;

                for (var allFilesIndex = 0, allFilesCount = allMatchingFiles.length; allFilesIndex < allFilesCount; ++allFilesIndex) {
                    var bookFile = allMatchingFiles[allFilesIndex];
                    if (bookFile.path != latestFilePath &&
                        // Check that it hasn't been modified in the last day
                        bookFile.modified.isBefore(moment().subtract(1, 'd'))) {
                        fs.unlink(bookFile.path);
                    }
                }

                return done(null);
            });
        });
    } catch (ex) {
        return done(ex);
    }
}

/**
 * A function that iterates over a file list to find all files that match a filter, as well as which of those files was the latest
 *
 * @param dir              The directory we are searching in.
 * @param filter           The filename filter.
 * @param index            The current index to look at in the fileList.
 * @param fileList         The list of files in the directory.
 * @param latest           The latest modified files timestamp.
 * @param latestFile       The latest modified filename.
 * @param allMatchingFiles All files that matched the filter.
 * @param done
 */
function _next(dir, filter, index, fileList, latest, latestFile, allMatchingFiles, done) {
    var file = fileList[index++];
    var fullFile = dir + '/' + file;

    if (!file) {
        return done(latest, latestFile, allMatchingFiles);
    }

    if (file.toString().match(filter)) {
        fs.stat(fullFile, function (error, stat) {
            if (error) {
                _next(dir, filter, index, fileList, latest, latestFile, allMatchingFiles, done);
            } else {
                if (stat && stat.isDirectory()) {
                    // We are only looking for files, so move onto the next file
                    _next(dir, filter, index, fileList, latest, latestFile, allMatchingFiles, done);
                } else {
                    var lastModified = moment(stat.mtime);
                    allMatchingFiles.push({path: fullFile, modified: lastModified});

                    if (!latest || lastModified.isAfter(latest)) {
                        latest = lastModified;
                        latestFile = file;
                    }

                    _next(dir, filter, index, fileList, latest, latestFile, allMatchingFiles, done);
                }
            }
        });
    } else {
        _next(dir, filter, index, fileList, latest, latestFile, allMatchingFiles, done);
    }
}

/**
 * Get the last build time for a content spec, by reading from a file.
 *
 * @param filename
 * @returns {moment}
 */
exports.getLastBuildTime = function(filename) {
    try {
        var stats = fs.lstatSync(filename);
        if (stats.isFile()) {
            return moment(fs.readFileSync(filename).toString().replace(/\n/g, ""));
        }
        return fs.readFileSync(filename);
    } catch (ex) {
        // Do nothing as it probably means the file doesn't exist
    }

    return null;
}

/**
 * Writes the build time for a spec to file.
 *
 * @param time
 * @param filename
 */
exports.writeLastBuildTime = function(time, filename) {
    try {
        fs.writeFileSync(filename, time.format(constants.DATE_FORMAT));
    } catch (ex) {
        util.error("Could not save " + filename);
    }
}

/**
 * Writes the sites configuration settings to <HTML_DIR>/config.js.
 *
 * @param serverEntities The server entity configuration
 */
exports.writeSiteConfig = function(serverEntities) {
    var configFile = config.HTML_DIR + "/config.js";
    var configContent = exports.buildSiteConfigJs(serverEntities);

    try {
        fs.writeFileSync(configFile, configContent);
    } catch (ex) {
        util.error("Could not save " + configFile);
    }
}

/**
 * Builds the initial sites config.js file content.
 *
 * @returns {string}
 */
exports.buildSiteConfigJs = function(serverEntities) {
    return "var OPEN_LINK_ID_MARKER = '" + constants.OPEN_LINK_ID_MARKER + "';\n\
var OPEN_LINK_LOCALE_MARKER = '" + constants.OPEN_LINK_LOCALE_MARKER + "';\n\
var TO_BE_SYNCED_LABEL = '" + constants.TO_BE_SYNCED_LABEL + "';\n\
var EDIT_LINK = '" + config.EDIT_LINK + "';\n\
var REST_SERVER = '" + config.REST_SERVER + "';\n\
var OPEN_LINK = '" + config.OPEN_LINK + "';\n\
var OPEN_LOCALE_LINK = '" + config.OPEN_LOCALE_LINK + "'\n\
var UI_URL = '" + config.UI_URL + "';\n\
var OBSOLETE_TAG = " + serverEntities.obsoleteTagId + ";\n\
var FROZEN_TAG = " + serverEntities.frozenTagId + ";";
}

/**
 * Builds the initial data.js file content.
 *
 * @param diff
 * @returns {string}
 */
exports.buildBaseDataJs = function(diff) {
    if (diff) {
        return "var buildTime = " + diff + ";\n\
var data = [\n";
    } else {
        return "var data = [\n";
    }
}

/**
 * Creates an entry that can be added to data.js for a content spec.
 *
 * @param lang            The content specs language if it is a translation.
 * @param specId          The content spec id.
 * @param specDetails     The content spec details.
 * @param zipFileName     The builds zip file name.
 * @param lastCompileTime The last time that the book was compiled.
 * @returns {string}
 */
exports.buildSpecDataJsEntry = function (specId, specDetails, zipFileName, lastCompileTime, lang) {
    // Check if the build was successful
    var status;
    if (lang) {
        status = fs.existsSync(config.HTML_DIR + "/" + lang + "/" + specId + "/index.html") ? "success" : "failure";
    } else {
        status = fs.existsSync(config.HTML_DIR + "/" + specId + "/index.html") ? "success" : "failure";
    }

    // Fixed the last compile time
    var fixedLastCompileTime = null;
    if (lastCompileTime) {
        fixedLastCompileTime = "'" + lastCompileTime + "'";
    }

    var entry = "    {\n\
        idRaw: " + specId + ",\n\
        versionRaw: '" + specDetails.version + "',\n\
        productRaw: '" + specDetails.product + "',\n\
        titleRaw: '" + specDetails.title + "',\n\
        status: '" + status + "',\n\
        lastcompile: " + fixedLastCompileTime + ",\n";

    if (lang) {
        entry += "        publicanbook: '" + constants.PUBLICAN_BOOK_ZIPS + "/" + lang + "/" + encodeURIComponent(zipFileName) + "'\n";
    } else {
        entry += "        tags: [" + specDetails.tags.toString() + "],\n\
        publicanbook: '" + constants.PUBLICAN_BOOK_ZIPS + "/" + encodeURIComponent(zipFileName) + "'\n"
    }

    entry += "    },\n";

    return entry;
}

/**
 * Checks to make sure we have the bar minimum values
 *
 * @param config
 */
exports.validateConfig = function(config) {
    // Validate that we have a REST_SERVER property
    if (typeof config.REST_SERVER === 'undefined' || config.REST_SERVER == null || config.REST_SERVER.trim().length == 0) {
        throw Error("The REST_SERVER configuration property hasn't been set.");
    }

    // Validate that we have a data dir
    if (typeof config.DATA_DIR === 'undefined' || config.DATA_DIR == null || config.DATA_DIR.trim().length == 0) {
        throw Error("The DATA_DIR configuration property hasn't been set.");
    }

    // Validate that we have a html dir
    if (typeof config.HTML_DIR === 'undefined' || config.HTML_DIR == null || config.HTML_DIR.trim().length == 0) {
        throw Error("The HTML_DIR configuration property hasn't been set.");
    }
}

/**
 * Fixes any partial URLs (ie missing a protocol, or trailing forward slash in the following configuration properties:
 *
 * REST_SERVER
 * UI_URL
 *
 * and also applies default values for the following values
 *
 * UI_URL (applied from the REST_SERVER variable)
 * EDIT_LINK (UI_URL + #ContentSpecFilteredResultsAndContentSpecView;query;contentSpecIds=${ID})
 * MAX_PROCESSES (number of cpus)
 * MAX_TRANSLATION_PROCESSES (number of cpus)
 * DELAY_WHEN_NO_UPDATES (60 secs)
 *
 * @param config
 */
exports.fixAndApplyDefaultsToConfig = function(config) {
    var numCPUs = os.cpus().length;

    // Fix the REST_SERVER url
    config.REST_SERVER = fixBaseUrl(config.REST_SERVER);

    // Make sure we have a UI_URL
    if (typeof config.UI_URL === 'undefined' || config.UI_URL == null || config.UI_URL.length == 0) {
        config.UI_URL = config.REST_SERVER.replace("pressgang-ccms/rest", "pressgang-ccms-ui");
    } else {
        config.UI_URL = fixBaseUrl(config.UI_URL);
    }

    // Make sure we have a EDIT_LINK
    if (typeof config.EDIT_LINK === 'undefined' || config.EDIT_LINK == null || config.EDIT_LINK.length == 0) {
        config.EDIT_LINK = config.UI_URL + "#ContentSpecFilteredResultsAndContentSpecView;query;contentSpecIds=${ID}";
    }

    // Set the max processes to the number of cpus, if it's not defined
    if (typeof config.MAX_PROCESSES === 'undefined' || config.MAX_PROCESSES == null) {
        config.MAX_PROCESSES = numCPUs;
    }
    if (typeof config.MAX_TRANSLATION_PROCESSES === 'undefined' || config.MAX_TRANSLATION_PROCESSES == null) {
        config.MAX_TRANSLATION_PROCESSES = numCPUs;
    }

    // Set the default delay time
    if (typeof config.DELAY_WHEN_NO_UPDATES === 'undefined' || config.DELAY_WHEN_NO_UPDATES == null) {
        config.DELAY_WHEN_NO_UPDATES = 60;
    }
}

function fixBaseUrl(urlString) {
    if (urlString == null || urlString.length == 0) return urlString;
    var fixedUrl = url.parse(urlString);

    // Make sure we have a protocol
    if (!fixedUrl.protocol) {
        fixedUrl.protocol = "http";
    }

    // Make sure the path name ends with a slash
    if (!endsWith(fixedUrl.pathname, "/")) {
        fixedUrl.pathname += "/";
    }

    return url.format(fixedUrl);
}