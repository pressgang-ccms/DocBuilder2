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
 * @param dir The directory to search
 * @param filter The format that the file names have to match to be considered
 * @param done a function to call when the latest file is found
 */
exports.getLatestFile = function(dir, filter, done) {
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
 * @param specId          The content spec id.
 * @param specDetails     The content spec details.
 * @param zipFileName     The builds zip file name.
 * @param lastCompileTime The last time that the book was compiled.
 * @returns {string}
 */
exports.buildSpecDataJsEntry = function (specId, specDetails, zipFileName, lastCompileTime) {
    // Check if the build was successful
    var status = fs.existsSync(config.HTML_DIR + "/" + specId + "/index.html") ? "success" : "failure";

    // Fixed the last compile time
    var fixedLastCompileTime = null;
    if (lastCompileTime) {
        fixedLastCompileTime = "'" + lastCompileTime + "'";
    }

    return "    {\n\
        idRaw: " + specId + ",\n\
        versionRaw: '" + specDetails.version + "',\n\
        productRaw: '" + specDetails.product + "',\n\
        titleRaw: '" + specDetails.title + "',\n\
        publicanbook: '" + constants.PUBLICAN_BOOK_ZIPS + "/" + encodeURIComponent(zipFileName) + "',\n\
        tags: [" + specDetails.tags.toString() + "],\n\
        status: '" + status + "',\n\
        lastcompile: " + fixedLastCompileTime + "\n\
    },\n";
}


/**
 * Creates an entry that can be added to a translation data.js for a content spec.
 *
 * @param lang            The translated content specs language.
 * @param specId          The content spec id.
 * @param specDetails     The content spec details.
 * @param pdfFileName     The builds PDF file name.
 * @param lastCompileTime The last time that the book was compiled.
 * @returns {string}
 */
exports.buildTranslatedSpecDataJsEntry = function (lang, specId, specDetails, pdfFileName, lastCompileTime) {
    // Check if the build was successful
    var status = fs.existsSync(config.HTML_DIR + "/" + lang + "/" + specId + "/index.html") ? "success" : "failure";

    // Fixed the last compile time
    var fixedLastCompileTime = null;
    if (lastCompileTime) {
        fixedLastCompileTime = "'" + lastCompileTime + "'";
    }

    return "    {\n\
        idRaw: " + specId + ",\n\
        versionRaw: '" + specDetails.version + "',\n\
        productRaw: '" + specDetails.product + "',\n\
        titleRaw: '" + specDetails.title + "',\n\
        pdfFileName: '" + pdfFileName + "\"',\n\
        lastcompile: " + fixedLastCompileTime + ",\n\
        status: '" + status + "'\n\
    },\n";
}