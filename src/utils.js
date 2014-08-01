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
exports.buildSpecDataJsEntry = function (specId, specDetails, zipFileName, lastCompileTime, lang, pdfFileName) {
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
        entry += "        publicanbook: '" + constants.PUBLICAN_BOOK_ZIPS + "/" + lang + "/" + encodeURIComponent(zipFileName) + "',\n\
        pdfFileName: '" + pdfFileName + "'\n";
    } else {
        entry += "        tags: [" + specDetails.tags.toString() + "],\n\
        publicanbook: '" + constants.PUBLICAN_BOOK_ZIPS + "/" + encodeURIComponent(zipFileName) + "'\n"
    }

    entry += "    },\n";

    return entry;
}