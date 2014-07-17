/*
 This file contains deployment specific info, like what server to contact for REST queries. When deploying
 DocBuilder, the contents of this file is all you will have to change.

 This file is currently configured for DocBuilder Next. This means the logo and links to the UI all reference
 Next.

 The stable release of DocBuilder should change the logo and links to the UI to not reference next.
 */
module.exports = {
    /**
     * The REST server hostname and port
     * @type {string}
     */
    BASE_SERVER:  "virt-ecs-01.lab.eng.bne.redhat.com:8080",
    /**
     * The UI instance to point to
     */
    UI_URL: "pressgang-ccms-ui-next",
    /**
     * The DocBuilder server
     */
    DOCBUILDER_SERVER: "docbuilder.usersys.redhat.com",
    /**
     * The marker in the OPEN_LINK string that is to be replaced by the spec ID
     */
    OPEN_LINK_ID_REPLACE: "${ID}",
    /**
     * The marker in the OPEN_LINK string that is to be replaced by the spec ID
     */
    OPEN_LINK_LOCALE_REPLACE: "${LOCALE}",
    /**
     * Where the links to open the books should go. Replace ${ID} with the spec ID
     */
    OPEN_LINK: "http://docbuilder.usersys.redhat.com/${ID}", //http://skynet.usersys.redhat.com:8080/pressgang-ccms-ui/#DocBuilderView;${ID}
    /**
     * Where the links to edit the books should go. Replace ${ID} with the spec ID
     */
    EDIT_LINK: "http://virt-ecs-01.lab.eng.bne.redhat.com:8080/pressgang-ccms-ui-next/#ContentSpecFilteredResultsAndContentSpecView;query;contentSpecIds=${ID}",
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
     * The data javascript file for the DocBuilder
     * @type {string}
     */
    DATA_JS: "/var/www/html/data.js",
    /**
     * The maximum number of child processes to run at any given time.
     * @type {number}
     */
    MAX_PROCESSES: 6
}
