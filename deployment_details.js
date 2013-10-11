/*
    This file contains deployment specific info, like what server to contact for REST queries. When deploying
    DocBuilder, the contents of this file is all you will have to change.
*/
module.exports = {
	/**
	 * The image that is used at the top of the screen
	 */
	LOGO: "pg-next.png",
	/**
	 * The logo width
	 */
	LOGO_WIDTH: 879,
	/**
	 * The logo height
	 */
	LOGO_HEIGHT: 87,
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
	 * The marker in the OPEN_LINK string that is to be replaced by the spec ID
	 */
	OPEN_LINK_ID_REPLACE: "${ID}",
	/**
	 * Where the links to open the books should go. Replace ${ID} with the spec ID
	 */
	OPEN_LINK: "http://docbuilder.usersys.redhat.com/${ID}", //http://skynet.usersys.redhat.com:8080/pressgang-ccms-ui/#DocBuilderView;${ID}
	/**
	 * Where the links to edit the books should go. Replace ${ID} with the spec ID
	 */
	EDIT_LINK: "http://topika.ecs.eng.bne.redhat.com:8080/pressgang-ccms-ui/#ContentSpecFilteredResultsAndContentSpecView;query;contentSpecIds=${ID}",
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
    MAX_PROCESSES: 6
}
