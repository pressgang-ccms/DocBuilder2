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


/*
 * This file contains config specific info, like what server to contact for REST queries. When deploying
 * DocBuilder, the contents of this file is all you will have to change.
 */
module.exports = {
    /**
     * The REST server url
     * @type {string}
     */
    REST_SERVER:  "http://localhost:8080/pressgang-ccms/rest",
    /**
     * The UI instance to point to
     * @type {string}
     */
    UI_URL: "http://localhost:8080/pressgang-ccms-ui",
    /**
     * Where the links to open the books should go.
     * @type {string}
     */
    OPEN_LINK: "http://docbuilder.example.com/${ID}/",
    /**
     * Where the links to open the translated books should go.
     * @type {string}
     */
    OPEN_LOCALE_LINK: "http://docbuilder.example.com/${LOCALE}/${ID}/",
    /**
     * Where the links to edit the books should go. Replace ${ID} with the spec ID
     * @type {string}
     */
    EDIT_LINK: "http://localhost:8080/pressgang-ccms-ui/#ContentSpecFilteredResultsAndContentSpecView;query;contentSpecIds=${ID}",
    /**
     * The directory that holds additional data, such as last build times.
     * @type {string}
     */
    DATA_DIR: "/home/pressgang/.docbuilder/",
    /**
     * The web root dir.
     * @type {string}
     */
    HTML_DIR: "/var/www/html",
    /**
     * The maximum number of child processes to run at any given time.
     * @type {number}
     */
    MAX_PROCESSES: 6,
    /**
     * The maximum number of child processes to run at any given time for translation builds.
     * @type {number}
     */
    MAX_TRANSLATION_PROCESSES: 4,
    /**
     * The amount of time to wait, in seconds, before querying the server when no updates were found.
     * @type {number}
     */
    DELAY_WHEN_NO_UPDATES: 60,
    /**
     * The URL to the pressgang_website.js for the docbuilder help overlay.
     * @type {string}
     */
    PRESSGANG_WEBSITE_JS_URL: "http://docbuilder.usersys.redhat.com/13968/html/files/pressgang_website.js",
    /**
     * The script used to build the book
     * @type {string}
     */
    BUILD_BOOK_SCRIPT: "/home/pressgang/DocBuilder2/build_original_books.sh",
    /**
     * The script used to build the translated books
     * @type {string}
     */
    BUILD_TRANSLATED_BOOK_SCRIPT: "/home/pressgang/DocBuilder2/build_books.sh"
}
