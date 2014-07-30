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

var config = require("./config.js");

/**
 * The file that holds the last time a complete rebuild was completed.
 * @type {string}
 */
exports.LAST_RUN_FILE = config.DATA_DIR + "docbuilder2_lastrun";

/**
 * The marker in the OPEN_LINK string that is to be replaced by the spec ID
 */
exports.OPEN_LINK_ID_MARKER = "${ID}";

/**
 * The marker in the OPEN_LINK string that is to be replaced by the spec ID
 */
exports.OPEN_LINK_LOCALE_MARKER = "${LOCALE}";

/**
 * The directory that holds the Publican ZIP files
 */
exports.PUBLICAN_BOOK_ZIPS= "/books";

/**
 *	The complete directory that holds the Publican ZIP files
 */
exports.PUBLICAN_BOOK_ZIPS_COMPLETE=config.HTML_DIR + exports.PUBLICAN_BOOK_ZIPS;

/**
 * The format of the date to be supplied to the REST query.
 * @type {string}
 */
exports.DATE_FORMAT = "YYYY-MM-DDTHH:mm:ss.000Z";

/**
 * A placeholder to be used when the details of the spec have not yet been downloaded
 * @type {string}
 */
exports.TO_BE_SYNCED_LABEL = "To Be Synced";

/**
 *
 * @type {{title: string, version: string, product: string, tags: Array}}
 */
exports.DEFAULT_SPEC_DETAILS = {
    title: exports.TO_BE_SYNCED_LABEL,
    version: exports.TO_BE_SYNCED_LABEL,
    product: exports.TO_BE_SYNCED_LABEL,
    tags: []
}