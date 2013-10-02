/*
    This file contains deployment specific info, like what server to contact for REST queries. When deploying
    DocBuilder, the contents of this file is all you will have to change.
*/
module.exports = {
    /**
     * The REST server hostname and port
     * @type {string}
     */
    BASE_SERVER:  "topika.ecs.eng.bne.redhat.com:8080",
    /**
     * The DocBuilder server
     */
    DOCBUILDER_SERVER: "docbuilder.usersys.redhat.com",
    /**
     * The file that holds the lat time a complete rebuild was completed.
     * @type {string}
     */
    LAST_RUN_FILE: "/home/pressgang/.docbuilder/docbuilder2_lastrun",
    /**
     * The web root dir.
     * @type {string}
     */
    APACHE_HTML_DIR: "/var/www/html",
    /**
     * The index file for the DocBuilder
     * @type {string}
     */
    INDEX_HTML: "/var/www/html/index.html",
    /**
     * The maximum number of child processes to run at any given time.
     * @type {number}
     */
    MAX_PROCESSES: 12
}
