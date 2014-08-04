// ==UserScript==
// @name          Docbuilder Overlay
// @namespace     https://skynet.usersys.redhat.com
// @include       http://docbuilder.usersys.redhat.com/*
// @require       http://code.jquery.com/jquery-2.0.3.min.js
// @require       https://rawgithub.com/moment/moment/2.2.1/min/moment.min.js
// ==/UserScript==

/*
 Copyright 2011-2014 Red Hat, Inc

 This file is part of PressGang CCMS.

 PressGang CCMS is free software: you can redistribute it and/or modify
 it under the terms of the GNU Lesser General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.

 PressGang CCMS is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU Lesser General Public License for more details.

 You should have received a copy of the GNU Lesser General Public License
 along with PressGang CCMS.  If not, see <http://www.gnu.org/licenses/>.
 */


/*
 This script works in a number of passes to extract the information from the document, and then pull down
 addition information from the REST server.

 1. 	When the DOM is ready, the script scans the document for the editor or bug links, and uses the information in
 the links to extract the topic information. When this is completed, the second pass is notified that this
 information is available.
 When the document is loaded, or after a timeout has been reached, the second pass is notified that it is ready
 to be run.

 NOTE: Between the first and second runs the user can manually mouse over the icons to have that information loaded.

 2.	The second pass is started once all the topics have been found, and after the document has been loaded or the
 timeout was reached.
 The second pass loaded the information for each topic in batches from the REST service, as well as information
 on the spec itself, such as which topics were added and removed.
 This information is used to prepopulate the information presented by the icons and side bar, and the information
 is stored in a number of cache objects.
 Once all the REST requests have completed, the third pass is started.

 3.	The third pass takes all the information found in the second pass and uses it to generate reports like
 license clashes.

 */

define(["jquery", "moment", "URI", "bootbox", "async", "raphael", "typo", "config", "raphael-pie"],
    function(jQuery, moment, URI, bootbox, asyncJs, Raphael, Typo) {
/**
 * The message to add to a bage while data is still downloading
 * @type {string}
 */
var PROCESSING_MESSAGE = "Thinking...";

/**
 * The message to add to a badge when it can not be populated because the userscript is missing
 * @type {string}
 */
var MISSING_SCRIPT = "!";
/**
 * Time to delay the closing of a popover window.
 * @type {number}
 */
var POPOVER_DELAY = 200;

/**
 * The background colour of ui elements.
 * @type {string}
 */
var BACKGROUND_COLOR = "rgb(66, 139, 202)";
/**
 * The license category
 * @type {number}
 */
var LICENSE_CATEGORY = 43;
/**
 * The id of the extended property that defines valid dictionary words
 * @type {number}
 */
var VALID_WORD_EXTENDED_PROPERTY_TAG_ID = 33;
/**
 * The id of the extended property that defines invalid dictionary words
 * @type {number}
 */
var INVALID_WORD_EXTENDED_PROPERTY_TAG_ID = 32;
/**
 * The id of the extended property that defines discourages dictionary words
 * @type {number}
 */
var DISCOURAGED_WORD_EXTENDED_PROPERTY_TAG_ID = 31;
/**
 * The id of the extended property that defines discourages dictionary phrases
 * @type {number}
 */
var DISCOURAGED_PHRASE_EXTENDED_PROPERTY_TAG_ID = 33;
/**
 * The ID of the tag that indicates the topic details the compatibility between two or more licenses
 * @type {number}
 */
var LICENSE_COMPATIBILITY_TAG = 679;
/**
 * The ID of the tag that indicates the topic details the incompatibility between two or more licenses
 * @type {number}
 */
var LICENSE_INCOMPATIBILITY_TAG = 678;
/**
 * A regex to extract URls
 * http://blog.mattheworiordan.com/post/13174566389/url-regular-expression-for-links-with-or-without-the
 * @type {RegExp}
 */
var URL_RE = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[-;:&=\+\$,\w]+@)?[A-Za-z0-9.-]+|(?:www.|[-;:&=\+\$,\w]+@)[A-Za-z0-9.-]+)((?:\/[\+~%\/.\w-_]*)?\??(?:[-\+=&;%@.\w_]*)#?(?:[\w]*))?)/g;
/**
 * A regex to extract XML comments
 * @type {RegExp}
 */
var COMMENT_RE = /<!--([\S\s]*?)-->/g;
/**
 * What to look for in a bug link to indicate the topic's ID
 * @type {string}
 */
var MATCH_PREFIX = "cf_build_id=";
/**
 * The regex that actually extracts the topic's ID
 * @type {string}
 */
var MATCH_BUILD_ID = MATCH_PREFIX + "[0-9]+";
/**
 * Some builds don't have report a bug links, but the editor links are included by DocBuilder, so if we can't use
 * the bug links, extract the topic id from the editor link.
 * @type {string}
 */
var MATCH_PREFIX2 = "topicIds=";
/**
 * The regex to extract the topic's id from the editor link.
 * @type {string}
 */
var MATCH_BUILD_ID2 = MATCH_PREFIX2 + "[0-9]+";
/**
 * The WebDAV server, without the protocol.
 * @type {string}
 */
var WEBDAV_SERVER = REST_SERVER.replace("rest", "webdav").replace(/http(s)?:\/\//, "");
/**
 * The pressgang ccms static resources url.
 * @type {string}
 */
var STATIC_URL = REST_SERVER.replace("pressgang-ccms/rest", "pressgang-ccms-static");
/**
 * The start of the URL to the REST endpoint to call to get all the details for all the topics
 * @type {string}
 */
var BACKGROUND_QUERY_PREFIX = REST_SERVER + "1/topics/get/json/query;topicIds="
/**
 * The end of the URL to the REST endpoint to call to get all the details for all the topics
 * @type {string}
 */
var BACKGROUND_QUERY_POSTFIX = "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22topics%22%7D%2C%20%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22contentSpecs_OTM%22%7D%2C%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22children_OTM%22%7D%7D%5D%7D%2C%7B%22trunk%22%3A%7B%22name%22%3A%20%22sourceUrls_OTM%22%7D%7D%2C%7B%22trunk%22%3A%7B%22name%22%3A%20%22revisions%22%2C%20%22start%22%3A%200%2C%20%22end%22%3A%2015%7D%2C%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22logDetails%22%7D%7D%5D%7D%2C%7B%22trunk%22%3A%7B%22name%22%3A%20%22tags%22%7D%7D%5D%7D%5D%7D%0A%0A";
/**
 * The number of topics to get the details on in one REST call
 * @type {number}
 */
var TOPIC_BATCH_SIZE = 20;
/**
 * Report a bug url.
 * @type {string}
 */
var BUG_LINK = "https://bugzilla.redhat.com/enter_bug.cgi?alias=&assigned_to=pressgang-ccms-dev%40redhat.com&bug_status=NEW&component=DocBook-builder&product=PressGang%20CCMS&version=1.8";
/**
 * List of element to skip when looking for text nodes
 * @type {Array}
 */
var SKIP_ELEMENTS = ["A", "SCRIPT", "PRE"];
/**
 * Maintains the topic to source URL info
 * @type {{}}
 */
var urlCache = {};

/**
 * Maintains the topic description info
 * @type {{}}
 */
var descriptionCache = {};
/**
 * Maintains the topic tags cache
 * @type {{}}
 */
var tagsCache = {};
/**
 * Maintains the spec cache
 * @type {{}}
 */
var specCache = {};
/**
 * Maintains the duplicated topics cache
 * @type {{}}
 */
var dupTopicsCache = {};
/**
 * Maintains the topic history cache.
 * keys are topic ids with values being revisions for the topic
 * summary key contains counts of last revisions
 * @type {{}}
 */
var historyCache = {};
/**
 * Maintains a list of the topics found in this book.
 * @type {Array}
 */
var topicIds = [];
/**
 * Maps topic ids to topic names;
 * @type {{}}
 */
var topicNames = {};
/**
 * Maps topic ids to topic revisions;
 * @type {{}}
 */
var topicLatestRevisions = {};
/**
 * A mapping of topic IDs to the section elements
 * @type {{}}
 */
var topicSections = {};
/**
 * A mapping of spec revisions to the topics contained in the revision
 * day key maps revision number from one day ago
 * week key maps revision number from one week ago
 * month key maps revision number from one month ago
 * year key maps revision number from one year ago
 * @type {{}}
 */
var specRevisionCache = {};

/**
 * true when secondPass() has been called after all the topics have been found
 * @type {boolean}
 */
var topicsFound = false;
/**
 * true when secondPass() has been called after a predetermined timeout
 * @type {boolean}
 */
var secondPassTimeout = false;
/**
 * true when secondPass() has been called after the window has been loaded
 * @type {boolean}
 */
var windowLoaded = false;
/**
 * true when secondPass() has been called and has actually started processing
 * @type {boolean}
 */
var secondPassCalled = false;
/**
 * There is a bug in Raphael that prevents a SVG text element from being created
 * properly when added to a canvas not attached to the DOM (https://github.com/DmitryBaranovskiy/raphael/issues/772).
 * This is kind of a problem, so this div element is off the screen and used to create new graphs.
 * @type {null}
 */
var offscreenRendering = null;
/**
 * true after the second pass has completed
 * @type {boolean}
 */
var secondPassDone = false;
/**
 * true after the spec history pass has completed
 * @type {boolean}
 */
var specHistoryDone = false;
/**
 * A collection of all the sied menus.
 * @type {Array}
 */
var sideMenus = [];
/**
 * Contains the event details, since we can't pass details via events to GreaseMonkey
 * @type {null}
 */
var eventDetails = null;

/**
 * The height of the schedule if displayed by PressZilla
 * @type {boolean}
 */
var scheduleHeight = 0;
/**
 * A collection of topics to process for spell checking. This holds any topics that are loaded before the
 * dictionary is loaded.
 * @type {Array}
 */
var topicsToCheckForSpelling = [];
/**
 * The TypoJS dictionary
 */
var dictionary;
/**
 * Spell checking counter
 */
var spellingErrorsCount = 0;
/**
 * Duplicated topics count
 */
var duplicatedTopicsCount = 0;
/**
 * Double word counter
 */
var doubleWordErrors = 0;
/**
 * Spell error buttons
 * @type {{}}
 */
var buttons = {};
/**
 * Doubled words buttons
 * @type {{}}
 */
var doubleWordButtons = {};

/**
 * A regular expression that can be used to detect if a string is entirely whitespace.
 */
var whitespaceRE = /^\s*$/;

/**
 * @returns The id of the content spec as listed in the URL
 */
function getSpecIdFromURL() {
    var urlComponents = window.location.href.split("/");
    for (var index = urlComponents.length - 1; index >= 0; --index) {
        var int = parseInt(urlComponents[index]);
        if (!isNaN(int)) {
            return int;
        }
    }

    return null;
}

/**
 * Adds links to section titles for easy bookmarking
 */
function addPermLinks() {
    jQuery("h5[class='title']>a[id], h4[class='title']>a[id], h3[class='title']>a[id], h2[class='title']>a[id]").each(function(index, element){
        jQuery(element.parentNode).append(jQuery("<span style='background: white' data-pressgangtopic='25677'> <a style='font-size: 10px' href='#" + element.id + "'>permlink</a></span>"));
    });
}

/**
 * Create and add the icons after the bug or editor links
 * @param topicId The topic ID
 * @param RoleCreatePara The element that held the link that we extracted the ID from.
 */
function addOverlayIcons(topicId, RoleCreatePara) {
    if (topicId != null && topicId.length > 0) {

        if (jQuery.inArray(topicId, topicIds) == -1) {
            topicIds.push(topicId);
            topicSections[topicId] = RoleCreatePara.parentNode;
        }

        var bubbleDiv = document.createElement("div");
        bubbleDiv.style.height = "42px";
        jQuery(bubbleDiv).insertAfter(RoleCreatePara);
        createSpecsPopover(topicId, bubbleDiv);
        createHistoryPopover(topicId, bubbleDiv);
        createTagsPopover(topicId, bubbleDiv);
        createUrlsPopover(topicId, bubbleDiv);
        createDescriptionPopover(topicId, bubbleDiv);
        createWebDAVPopover(topicId, bubbleDiv);
        createBugzillaPopover(topicId, bubbleDiv);
        createSolutionsPopover(topicId, bubbleDiv);
        createMojoPopover(topicId, bubbleDiv);
        createJBossPopover(topicId, bubbleDiv);
        createPnTPopover(topicId, bubbleDiv);
        createDuplicatedTopicPopover(topicId, bubbleDiv);
    }
}

function createWebDAVPopover(topicId, parent) {
    var linkDiv = createIcon("webdav", topicId, 24804);
    parent.appendChild(linkDiv);

    var popover = createPopover("WebDAV", topicId);
    document.body.appendChild(popover);

    var path = "/TOPICS";
    for (var charIndex = 0, charLength = topicId.toString().length; charIndex < charLength; ++charIndex) {
        path += "/" + topicId.toString().charAt(charIndex);
    }
    path += "/TOPIC" + topicId;
    var fullPath = path + "/" + topicId + ".xml";

    popover.popoverContent.innerHTML = '';
    jQuery(popover.popoverContent).append(jQuery("<h3>WebDAV URLs</h3>"));
    jQuery(popover.popoverContent).append(jQuery("<ul><li>http://" + WEBDAV_SERVER + fullPath + "</li><li><a href='webdav://" + WEBDAV_SERVER + fullPath + "'>webdav://" + WEBDAV_SERVER + fullPath + "</a></li></ul>"))
    jQuery(popover.popoverContent).append(jQuery("<h3>Editing With Cadaver (copy and paste into a terminal):</h3>"));
    jQuery(popover.popoverContent).append(jQuery("<p>cadaver http://" + WEBDAV_SERVER + path + "<br/>edit " + topicId + ".xml<br/>exit</p>"));
    jQuery(popover.popoverContent).append(jQuery("<p><a href='/16778'>Further Reading</a></p>"));

    linkDiv.onmouseover=function(){
        openPopover(popover, linkDiv);
    };

    setupEvents(linkDiv, popover);
}

function createSolutionsPopover(topicId, parent) {
    var linkDiv = createIcon("lightbulb", topicId, 24799);
    parent.appendChild(linkDiv);

    var popover = createPopover("KCS Solutions", topicId);
    document.body.appendChild(popover);

    var legend = jQuery("<div style='padding-left: 8px; padding-right:8px; width: 746px; height: 42px; color: white; background-color: " + BACKGROUND_COLOR + "; display: table-cell; vertical-align: middle; font-weight: bold'><div style='float:left'>\
<span>KCS Solutions: </span>\
<span style='color: #5cb85c'>Published</span> \
<span> | </span> \
<span style='color: #d9534f'>Unpublished</span>\
</div>");

    jQuery(popover.popoverTitle).replaceWith(legend);

    popover.popoverContent.innerHTML = '\
<p>This popover displays KCS solutions that match the keywords in the topic.</p>\
<p>This window is only active if the latest version of PressZilla is installed.</p>\
<p>Firefox user can install GreaseMonkey from <a href="https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/">here</a>.</p>\
<p>Chrome / Chromium users can install TamperMonkey from <a href="https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=en">here</a>.</p>\
<p>With GreaseMonkey/TamperMonkey installed, you can install the <a href="/PressZilla.user.js">PressZilla GreaseMonkey Extension</a>.</p>';

    linkDiv.onmouseover=function(){
        openPopover(popover, linkDiv);
        // This is required to send events from this page to a GreaseMonkey script. The code
        //      jQuery('window').trigger("solutions_opened", ['solutions', topicId, popover.id]);
        // does not work.
        var evt = document.createEvent( 'Event');
        evt.initEvent('solutions_opened', false, false);
        eventDetails =  {source: 'solutions', topicId: topicId, popoverId: popover.id};
        window.dispatchEvent (evt);
    };

    setupEvents(linkDiv, popover);
}


function createPnTPopover(topicId, parent) {
    var linkDiv = createIcon("money", topicId, 24798);
    parent.appendChild(linkDiv);

    var popover = createPopover("PnT Content", topicId);
    document.body.appendChild(popover);

    popover.popoverContent.innerHTML = '\
<p>This popover displays PnT content that match the keywords in the topic.</p>\
<p>This window is only active if the latest version of PressZilla is installed.</p>\
<p>Firefox user can install GreaseMonkey from <a href="https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/">here</a>.</p>\
<p>Chrome / Chromium users can install TamperMonkey from <a href="https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=en">here</a>.</p>\
<p>With GreaseMonkey/TamperMonkey installed, you can install the <a href="/PressZilla.user.js">PressZilla GreaseMonkey Extension</a>.</p>';


    linkDiv.onmouseover=function(){
        openPopover(popover, linkDiv);
        // This is required to send events from this page to a GreaseMonkey script. The code
        //      jQuery('window').trigger("solutions_opened", ['solutions', topicId, popover.id]);
        // does not work.
        var evt = document.createEvent( 'Event');
        evt.initEvent('pnt_opened', false, false);
        eventDetails =  {source: 'pnt', topicId: topicId, popoverId: popover.id};
        window.dispatchEvent (evt);
    };

    setupEvents(linkDiv, popover);
}

function createDuplicatedTopicPopover(topicId, parent) {
    var linkDiv = createIcon("duplicate", topicId, 24798);

    parent.appendChild(linkDiv);

    var popover = createPopover("Duplicate Topics", topicId);
    document.body.appendChild(popover);

    dupTopicsCache[topicId] = {popover: popover};

    popover.popoverContent.innerHTML = '<p>This popover displays topics that are at least 50% similar to this topic.</p>';

    linkDiv.onmouseover=function(){
        openPopover(popover, linkDiv);

        if (!dupTopicsCache[topicId].data && !dupTopicsCache[topicId].loading) {
            dupTopicsCache[topicId].loading = true;
            var similarTopicsUrl = REST_SERVER + "1/topics/get/json/query;minHash=" + topicId + "%3A0.6?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%22topics%22%7D%5D%7D";
            jQuery.getJSON(similarTopicsUrl, function(popover) {
                return function(data){
                    dupTopicsCache[topicId].loading = false;

                    dupTopicsCache[topicId].data = [];

                    data.items.sort(function(a, b){
                        if (a.item.revision < b.item.revision) {
                            return 1;
                        }
                        if (a.item.revision == b.item.revision) {
                            return 0;
                        }
                        return -1;
                    });

                    for (var topicIndex = 0, topicCount = data.items.length; topicIndex < topicCount; ++topicIndex) {
                        dupTopicsCache[topicId].data.push(data.items[topicIndex].item);
                    }

                    updateCount(topicId + "duplicateIcon", dupTopicsCache[topicId].data.length);
                    renderDuplicatedTopic(topicId);
                }
            }(popover));
        } else {
            renderDuplicatedTopic(topicId);
        }
    };

    setupEvents(linkDiv, popover);
}

function renderDuplicatedTopic(topicId) {

    dupTopicsCache[topicId].loading = true;

    jQuery.getJSON( REST_SERVER + "1/topic/get/json/" + topicId, function(topic){

        function addThisTopic() {

            var container = document.createElement("div");
            var link = document.createElement("a");
            container.appendChild(link);

            link.style.color = "red";

            var revisionDate = new moment(topic.lastModified).format("DD MMM YYYY");

            jQuery(link).text(topic.id + " Rev: " + topic.revision + " Date: " + revisionDate + " - " + topic.title);
            link.setAttribute("href", UI_URL + '#SearchResultsAndTopicView;query;topicIds=' + topic.id);
            dupTopicsCache[topicId].popover.popoverContent.appendChild(container);
        }

        dupTopicsCache[topicId].popover.popoverContent.innerHTML = '<p>No duplicate topics found.</p>';

        if (dupTopicsCache[topicId].data) {
            var foundPlaceForThisTopic = false;
            if (dupTopicsCache[topicId].data.length != 0) {
                dupTopicsCache[topicId].popover.popoverContent.innerHTML = '<p>Duplicated topics are listed in descending order by revision number.\
            This means that the most recently edited topics are listed first. </p>\
            <p>The topic used by this content specification is shown in red. Topics listed above the one shown in red should be reviewed for any updated content that may be relevant to this content specification.</p>';

                for (var index = 0, count = dupTopicsCache[topicId].data.length; index < count; ++index) {

                    var dupTopic =  dupTopicsCache[topicId].data[index];

                    if (!foundPlaceForThisTopic && dupTopic.revision < topic.revision) {
                        foundPlaceForThisTopic = true;
                        addThisTopic();
                    }

                    var container = document.createElement("div");
                    var link = document.createElement("a");
                    container.appendChild(link);

                    var revisionDate = new moment(dupTopic.lastModified).format("DD MMM YYYY");

                    jQuery(link).text(dupTopic.id + " Rev: " + dupTopic.revision + " Date: " + revisionDate + " - " + dupTopic.title);
                    link.setAttribute("href", UI_URL + '#SearchResultsAndTopicView;query;topicIds=' + dupTopic.id);
                    dupTopicsCache[topicId].popover.popoverContent.appendChild(container);
                }

                if (!foundPlaceForThisTopic) {
                    addThisTopic();
                }
            }
        }
    });

}

function createMojoPopover(topicId, parent) {
    var linkDiv = createIcon("jive", topicId, 24801);
    parent.appendChild(linkDiv);

    var popover = createPopover("Mojo Documents", topicId);
    document.body.appendChild(popover);

    popover.popoverContent.innerHTML = '\
<p>This popover displays Mojo documents that match the keywords in the topic.</p>\
<p>This window is only active if the latest version of PressZilla is installed.</p>\
<p>Firefox user can install GreaseMonkey from <a href="https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/">here</a>.</p>\
<p>Chrome / Chromium users can install TamperMonkey from <a href="https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=en">here</a>.</p>\
<p>With GreaseMonkey/TamperMonkey installed, you can install the <a href="/PressZilla.user.js">PressZilla GreaseMonkey Extension</a>.</p>';


    linkDiv.onmouseover=function(){
        openPopover(popover, linkDiv);
        // This is required to send events from this page to a GreaseMonkey script. The code
        //      jQuery('window').trigger("solutions_opened", ['solutions', topicId, popover.id]);
        // does not work.
        var evt = document.createEvent( 'Event');
        evt.initEvent('mojo_opened', false, false);
        eventDetails =  {source: 'mojo', topicId: topicId, popoverId: popover.id};
        window.dispatchEvent (evt);
    };

    setupEvents(linkDiv, popover);
}

function createBugzillaPopover(topicId, parent) {
    var linkDiv = createIcon("bug", topicId, 24803);
    parent.appendChild(linkDiv);

    var popover = createPopover("Bugzilla Bugs", topicId);
    document.body.appendChild(popover);

    popover.popoverContent.innerHTML = '\
<p>This popover displays Bugzilla bugs raised against this topic.</p>\
<p>This window is only active if the latest version of PressZilla is installed.</p>\
<p>Firefox user can install GreaseMonkey from <a href="https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/">here</a>.</p>\
<p>Chrome / Chromium users can install TamperMonkey from <a href="https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=en">here</a>.</p>\
<p>With GreaseMonkey/TamperMonkey installed, you can install the <a href="/PressZilla.user.js">PressZilla GreaseMonkey Extension</a>.</p>';


    linkDiv.onmouseover=function(){
        openPopover(popover, linkDiv);
        // This is required to send events from this page to a GreaseMonkey script. The code
        //      jQuery('window').trigger("solutions_opened", ['solutions', topicId, popover.id]);
        // does not work.
        var evt = document.createEvent( 'Event');
        evt.initEvent('bugzilla_opened', false, false);
        eventDetails =  {source: 'bugzilla', topicId: topicId, popoverId: popover.id};
        window.dispatchEvent (evt);
    };

    setupEvents(linkDiv, popover);
}

function createJBossPopover(topicId, parent) {
    var linkDiv = createIcon("jboss", topicId, 24791);
    parent.appendChild(linkDiv);

    var popover = createPopover("JBoss.org Content", topicId);
    document.body.appendChild(popover);

    popover.popoverContent.innerHTML = '\
<p>This popover displays JBoss.org documents that match the keywords in the topic.</p>\
<p>Firefox user can install GreaseMonkey from <a href="https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/">here</a>.</p>\
<p>Chrome / Chromium users can install TamperMonkey from <a href="https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo?hl=en">here</a>.</p>\
<p>With GreaseMonkey/TamperMonkey installed, you will need to install the <a href="/PressZilla.user.js">PressZilla GreaseMonkey Extension</a>.</p>';


    linkDiv.onmouseover=function(){
        openPopover(popover, linkDiv);
        // This is required to send events from this page to a GreaseMonkey script. The code
        //      jQuery('window').trigger("solutions_opened", ['solutions', topicId, popover.id]);
        // does not work.
        var evt = document.createEvent( 'Event');
        evt.initEvent('jboss_opened', false, false);
        eventDetails =  {source: 'jboss', topicId: topicId, popoverId: popover.id};
        window.dispatchEvent (evt);
    };

    setupEvents(linkDiv, popover);
}

/**
 * Creates the popuver that lists the specs the topic is included in.
 * @param topicId The topic id
 * @param parent The element that should hold the icon
 */
function createSpecsPopover(topicId, parent) {
    var linkDiv = createIcon("book", topicId, 24788);
    parent.appendChild(linkDiv);

    var popover = createPopover("Content Specifications", topicId);
    document.body.appendChild(popover);

    specCache[topicId] = {popover: popover};

    linkDiv.onmouseover=function(){

        openPopover(popover, linkDiv);

        if (!specCache[topicId].data) {
            jQuery.getJSON( REST_SERVER + "1/contentspecnodes/get/json/query;csNodeType=0%2C9%2C10;csNodeEntityId=" + topicId + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A+%22nodes%22%7D%2C+%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A+%22inheritedCondition%22%7D%7D%2C+%7B%22trunk%22%3A%7B%22name%22%3A+%22contentSpec%22%7D%2C+%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A+%22children_OTM%22%7D%7D%5D%7D%5D%7D%5D%7D",
                function(popover) {
                    return function( data ) {
                        specCache[topicId].data = [];
                        specs = {};
                        for (var specIndex = 0, specCount = data.items.length; specIndex < specCount; ++specIndex) {
                            var spec = data.items[specIndex].item.contentSpec;
                            if (!specs[spec.id]) {
                                var specDetails = {id: spec.id, title: "", product: "", version: ""};
                                for (var specChildrenIndex = 0, specChildrenCount = spec.children_OTM.items.length; specChildrenIndex < specChildrenCount; ++specChildrenIndex) {
                                    var child = spec.children_OTM.items[specChildrenIndex].item;
                                    if (child.title == "Product") {
                                        specDetails.product = child.additionalText;
                                    } else if (child.title == "Version") {
                                        specDetails.version = child.additionalText;
                                    } if (child.title == "Title") {
                                        specDetails.title = child.additionalText;
                                    }
                                }
                                specs[spec.id] = specDetails;
                            }
                        }

                        for (spec in specs) {
                            specCache[topicId].data.push(specs[spec]);
                        }

                        updateCount(linkDiv.id, specCache[topicId].data.length);
                        renderSpecs(topicId);

                    }
                }(popover));
        } else {
            renderSpecs(topicId);
        }
    };

    setupEvents(linkDiv, popover);
}

/**
 * Renderes the list of specs that a topics is referenced in.
 * @param topicId The topic whose spec popup is being generated.
 */
function renderSpecs(topicId) {
    specCache[topicId].popover.popoverContent.innerHTML = '';

    for (var index = 0, count = specCache[topicId].data.length; index < count; ++index) {
        var spec =  specCache[topicId].data[index];
        var link = jQuery("<div><a target='_blank' href='" + UI_URL + "/#ContentSpecFilteredResultsAndContentSpecView;query;contentSpecIds=" + spec.id + "'><div style='width: 16px; height: 16px; margin-right: 8px; background-image: url(/lib/docbuilder-overlay/images/edit.png); background-size: contain; float: left'></div></a><a href='/" + spec.id + "'>" + spec.id + ":  " + spec.title + ", " + spec.product + " " + spec.version + "</a></div>");
        jQuery(specCache[topicId].popover.popoverContent).append(link);
    }
}

/**
 * Create the popover that lists the topic's tags
 * @param topicId The topic id
 * @param parent The element that should hold the icon
 */
function createTagsPopover(topicId, parent) {
    var linkDiv = createIcon("tags", topicId, 24796);
    parent.appendChild(linkDiv);

    var popover = createPopover("Tags", topicId);
    document.body.appendChild(popover);

    tagsCache[topicId] = {popover: popover};

    linkDiv.onmouseover=function(){

        openPopover(popover, linkDiv);

        if (!tagsCache[topicId].data) {
            jQuery.getJSON( REST_SERVER + "1/topic/get/json/" + topicId + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22tags%22%7D%7D%5D%7D",
                function(popover) {
                    return function( data ) {
                        tagsCache[topicId].data = [];
                        for (var tagIndex = 0, tagCount = data.tags.items.length; tagIndex < tagCount; ++tagIndex) {
                            tagsCache[topicId].data.push({
                                name: data.tags.items[tagIndex].item.name,
                                id: data.tags.items[tagIndex].item.id
                            });
                        }
                        updateCount(linkDiv.id, tagsCache[topicId].data.length);
                        renderTags(topicId);
                    }
                }(popover));
        } else {
            renderTags(topicId);
        }
    };

    setupEvents(linkDiv, popover);
}

/**
 * Renderes the list of tags that are assigned to the topic
 * @param topicId The topic whose tags popup is being generated.
 */
function renderTags(topicId) {
    tagsCache[topicId].popover.popoverContent.innerHTML = '';

    var tagCount = tagsCache[topicId].data.length;
    if (tagCount != 0) {
        for (var tagIndex = 0; tagIndex < tagCount; ++tagIndex) {
            var tag = tagsCache[topicId].data[tagIndex];
            var link = document.createElement("div");

            jQuery(link).text(tag.name);
            tagsCache[topicId].popover.popoverContent.appendChild(link);
        }
    } else {
        jQuery(tagsCache[topicId].popover.popoverContent).text('[No Tags]');
    }
}

/**
 * Create the popover that lists the topic's URLs
 * @param topicId The topic id
 * @param parent The element that should hold the icon
 */
function createUrlsPopover(topicId, parent) {
    var linkDiv = createIcon("urls", topicId, 24797);
    parent.appendChild(linkDiv);

    var popover = createPopover("URLs", topicId);
    document.body.appendChild(popover);

    urlCache[topicId] = {popover: popover};

    linkDiv.onmouseover=function(){

        openPopover(popover, linkDiv);

        if (!urlCache[topicId].data) {

            jQuery.getJSON( REST_SERVER + "1/topic/get/json/" + topicId + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22sourceUrls_OTM%22%7D%7D%5D%7D",
                function(popover) {
                    return function( data ) {
                        urlCache[topicId].data = [];

                        var match = null;
                        while (match = COMMENT_RE.exec(data.xml)) {
                            var comment = match[1];

                            var match2 = null;
                            while (match2 = URL_RE.exec(comment)) {
                                var url = match2[0];
                                urlCache[topicId].data.push({url: url, title: "[Comment] " + url});
                            }
                        }

                        if (data.sourceUrls_OTM.items.length != 0) {

                            for (var urlIndex = 0, urlCount = data.sourceUrls_OTM.items.length; urlIndex < urlCount; ++urlIndex) {
                                var url = data.sourceUrls_OTM.items[urlIndex].item;
                                urlCache[topicId].data.push({url: url.url, title: url.title == null || url.title.length == 0 ? url.url : url.title});
                            }
                        }

                        updateCount(linkDiv.id, urlCache[topicId].data.length);
                        renderUrls(topicId);
                    }
                }(popover));
        } else {
            renderUrls(topicId);
        }
    };

    setupEvents(linkDiv, popover);
}

/**
 * Renderes the list of source urls that are assigned to the topic
 * @param topicId The topic whose urls popup is being generated.
 */
function renderUrls(topicId) {
    urlCache[topicId].popover.popoverContent.innerHTML = '';

    for (var index = 0, count = urlCache[topicId].data.length; index < count; ++index) {
        var urlData = urlCache[topicId].data[index];

        var container = document.createElement("div");
        var link = document.createElement("a");

        jQuery(link).text(urlData.title);
        link.setAttribute("href", urlData.url);

        container.appendChild(link);
        urlCache[topicId].popover.popoverContent.appendChild(container);
    }

    if (urlCache[topicId].popover.popoverContent.innerHTML == '') {
        jQuery(urlCache[topicId].popover.popoverContent).text('[No Source URLs]');
    }
}

/**
 * Create the popover that lists the topic's revision history
 * @param topicId The topic id
 * @param parent The element that should hold the icon
 */
function createHistoryPopover(topicId, parent) {
    var linkDiv = createIcon("history", topicId, 24802);
    parent.appendChild(linkDiv);

    var popover = createPopover("History", topicId);
    document.body.appendChild(popover);

    var legend = jQuery("<div style='padding-left: 8px; padding-right:8px; width: 746px; height: 42px; color: white; background-color: " + BACKGROUND_COLOR + "; display: table-cell; vertical-align: middle; font-weight: bold'><div style='float:left'>History. Last revision edited in&nbsp;</div>\
<div style='width: 25px; height: 26px; float: left; background-image: url(/lib/docbuilder-overlay/images/history-blue.png)'/><div style='float:left'>&nbsp;1 Day,&nbsp;</div> \
<div style='width: 25px; height: 26px; float: left; background-image: url(/lib/docbuilder-overlay/images/history-green.png)'/><div style='float:left'>&nbsp;1 Week,&nbsp;</div> \
<div style='width: 25px; height: 26px; float: left; background-image: url(/lib/docbuilder-overlay/images/history-yellow.png)'/><div style='float:left'>&nbsp;1 Month,&nbsp;</div> \
<div style='width: 25px; height: 26px; float: left; background-image: url(/lib/docbuilder-overlay/images/history-orange.png)'/><div style='float:left'>&nbsp;1 Year,&nbsp;</div> \
<div style='width: 25px; height: 26px; float: left; background-image: url(/lib/docbuilder-overlay/images/history-red.png)'/><div style='float:left'>&nbsp;Older&nbsp;</div></div>");

    jQuery(popover.popoverTitle).replaceWith(legend);

    historyCache[topicId] = {popover: popover};

    linkDiv.onmouseover=function(){

        openPopover(popover, linkDiv);

        if (!historyCache[topicId].data) {
            jQuery.getJSON( REST_SERVER + "1/topic/get/json/" + topicId + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22revisions%22%2C%20%22start%22%3A0%2C%20%22end%22%3A15%7D%2C%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22logDetails%22%7D%7D%5D%7D%5D%7D",
                function(popover) {
                    return function( data ) {

                        historyCache[topicId].data = [];

                        for (var revisionIndex = 0, revisionCount = data.revisions.items.length; revisionIndex < revisionCount; ++revisionIndex) {
                            var revision = data.revisions.items[revisionIndex].item;
                            historyCache[topicId].data.push({revision: revision.revision, message: revision.logDetails.message, lastModified: revision.lastModified});
                        }

                        renderHistory(topicId);
                        updateHistoryIcon(topicId);
                        updateCount(linkDiv.id, historyCache[topicId].data.length);
                    }
                }(popover));
        } else {
            renderHistory(topicId);
        }
    };

    setupEvents(linkDiv, popover);
}

/**
 * Renders the list of topic revisions revisions
 * @param topicId The topic whose revisions popup is being generated.
 */
function renderHistory(topicId) {
    historyCache[topicId].popover.popoverContent.innerHTML = '';

    for (var revisionIndex = 0, revisionCount = historyCache[topicId].data.length; revisionIndex < revisionCount; ++revisionIndex) {
        var revision = historyCache[topicId].data[revisionIndex];
        var message = revision.message == null || revision.message.length == 0 ? "[No Message]" : revision.message;
        var date = moment(revision.lastModified);

        var icon = "";

        if (date.isAfter(moment().subtract('day', 1))) {
            icon = 'url(/lib/docbuilder-overlay/images/rendereddiff-blue.png)';
        } else if (date.isAfter(moment().subtract('week', 1))) {
            icon = 'url(/lib/docbuilder-overlay/images/rendereddiff-green.png)';
        } else if (date.isAfter(moment().subtract('month', 1))) {
            icon = 'url(/lib/docbuilder-overlay/images/rendereddiff-yellow.png)';
        } else if (date.isAfter(moment().subtract('year', 1))) {
            icon = 'url(/lib/docbuilder-overlay/images/rendereddiff-orange.png)';
        } else {
            icon = 'url(/lib/docbuilder-overlay/images/rendereddiff-red.png)';
        }


        var link = jQuery("<div><a target='_blank' href='" + UI_URL + "#TopicHistoryView;" + topicId + ";" + revision.revision + ";" + historyCache[topicId].data[0].revision + "'><div style='width: 16px; height: 16px; margin-right: 8px; background-image: " + icon + "; background-size: contain; float: left'></div></a>" + revision.revision + " - " + date.format('lll') + " - " + message + "</div>");
        jQuery(historyCache[topicId].popover.popoverContent).append(link);
    }
}

/**
 * Updates the icon used for the history based on how long ago the topic was last edited. Also adds the links to the
 * topics in the various history submenus.
 * @param topicId The topic whose tags popup is being generated.
 * @param title The topic title.
 */
function updateHistoryIcon(topicId, title) {
    var icon = jQuery("#" + topicId + "historyIcon");
    var date = moment(historyCache[topicId].data[0].lastModified);

    // set the icon
    if (date.isAfter(moment().subtract('day', 1))) {
        icon.css('background-image', 'url(/lib/docbuilder-overlay/images/history-blue.png)');
    } else if (date.isAfter(moment().subtract('week', 1))) {
        icon.css('background-image', 'url(/lib/docbuilder-overlay/images/history-green.png)');
    } else if (date.isAfter(moment().subtract('month', 1))) {
        icon.css('background-image', 'url(/lib/docbuilder-overlay/images/history-yellow.png)');
    } else if (date.isAfter(moment().subtract('year', 1))) {
        icon.css('background-image', 'url(/lib/docbuilder-overlay/images/history-orange.png)');
    } else {
        icon.css('background-image', 'url(/lib/docbuilder-overlay/images/history-red.png)');
    }

    var ele = jQuery('<li><a>' + title + '</a></li>');
    ele.click(function() {
        topicSections[topicId].scrollIntoView();
    });

    // add the menu icons
    if (date.isAfter(moment().subtract('day', 1))) {
        ele.appendTo(jQuery("#topicsEditedIn1DayItems"));
    }

    if (date.isAfter(moment().subtract('week', 1))) {
        ele.appendTo(jQuery("#topicsEditedIn1WeekItems"));
    }

    if (date.isAfter(moment().subtract('month', 1))) {
        ele.appendTo(jQuery("#topicsEditedIn1MonthItems"));
    }

    if (date.isAfter(moment().subtract('year', 1))) {
        ele.appendTo(jQuery("#topicsEditedIn1YearItems"));
    }

    ele.appendTo(jQuery("#topicsEditedInOlderThanYearItems"));
}

/**
 * Create the popover that displays the topic's description
 * @param topicId The topic id
 * @param parent The icon
 */
function createDescriptionPopover(topicId, parent) {
    var linkDiv = createIcon("info", topicId, 24795);
    parent.appendChild(linkDiv);

    var popover = createPopover("Description", topicId);
    document.body.appendChild(popover);

    descriptionCache[topicId] = {popover: popover};

    linkDiv.onmouseover=function(){

        openPopover(popover, linkDiv);

        if (!descriptionCache[topicId].data) {
            jQuery.getJSON( REST_SERVER + "1/topic/get/json/" + topicId, function(popover) {
                return function( data ) {
                    descriptionCache[topicId].data = data.description;
                    renderDescription(topicId);
                }
            }(popover));
        } else {
            renderDescription(topicId);
        }
    };

    setupEvents(linkDiv, popover);
}


/**
 * Renders the topic description
 * @param topicId The topic whose revisions popup is being generated.
 */
function renderDescription(topicId) {
    if (descriptionCache[topicId].data.trim().length != 0) {
        jQuery(descriptionCache[topicId].popover.popoverContent).text(descriptionCache[topicId].data);
    } else {
        jQuery(descriptionCache[topicId].popover.popoverContent).text("[No Description]");
    }
}

/**
 * Some code to be executed whenever a popover is shown
 * @param popover The popover div
 * @param linkDiv The link that we extracted the topic's ID from
 */
function openPopover(popover, linkDiv) {
    if (popover.timeout) {
        clearTimeout(popover.timeout);
        popover.timeout = null;
    }

    popover.timeout = setTimeout(function() {
        popover.style.left= linkDiv.parentNode.offsetLeft + 'px';
        popover.style.top= (linkDiv.offsetTop - 300) + 'px';
        popover.style.display = '';
    }, POPOVER_DELAY);
}

/**
 * Setup the event handlers on the popover and the icon
 * @param popover The popover div
 * @param linkDiv The icon
 */
function setupEvents(linkDiv, popover) {
    linkDiv.onmouseout=function(popover) {
        return function(){

            if (popover.timeout) {
                clearTimeout(popover.timeout);
                popover.timeout = null;
            }

            popover.timeout = setTimeout(function() {
                popover.style.display = 'none';
            }, POPOVER_DELAY);
        }
    }(popover);

    popover.onmouseover = function(popover) {
        return function() {
            if (popover.timeout) {
                clearTimeout(popover.timeout);
                popover.timeout = null;
            }
        }
    }(popover);

    popover.onmouseout = function(popover) {
        return function() {

            if (popover.timeout) {
                clearTimeout(popover.timeout);
                popover.timeout = null;
            }

            popover.timeout = setTimeout(function() {
                popover.style.display = 'none';
            }, POPOVER_DELAY);
        }
    }(popover);
}



function findTopicsInHtml() {
    var foundTopics = {};
    var elements = document.getElementsByTagName("div");
    for (var i = elements.length - 1; i >= 0; --i) {
        var element = elements[i];
        if (element.className.match(".*RoleCreateBugPara.*")) {
            if (element.innerHTML.match(".*Report a bug.*")) {
                var startPos = element.innerHTML.search(MATCH_BUILD_ID);
                if (startPos != -1) {
                    var temp = element.innerHTML.substring(startPos + MATCH_PREFIX.length);
                    var endPos = temp.search("(?![0-9]+).*");
                    var id = temp.substring(0, endPos);
                    if (!foundTopics[id]) {
                        addOverlayIcons(id, element);
                        foundTopics[id] = true;
                    }
                }
            } else if (element.innerHTML.match(".*Edit this topic.*")) {
                var startPos = element.innerHTML.search(MATCH_BUILD_ID2);
                if (startPos != -1) {
                    var temp = element.innerHTML.substring(startPos + MATCH_PREFIX2.length);
                    var endPos = temp.search("(?![0-9]+).*");
                    var id = temp.substring(0, endPos);
                    if (!foundTopics[id]) {
                        addOverlayIcons(id, element);
                        foundTopics[id] = true;
                    }
                }
            }
        }
    }

    secondPass(true, false, false);
}

/**
 * Create the icon used to display a popup
 * @param img The name of the image to be used for the icon, exluding the filename
 * @param topicId The topic id
 * @returns The icon element
 */
function createIcon(img, topicId, helpid) {
    var linkDiv = document.createElement("div");
    linkDiv.setAttribute("id", topicId + img + "Icon");
    linkDiv.style.backgroundColor = "white";
    linkDiv.style.backgroundImage = "url(/lib/docbuilder-overlay/images/" + img + ".png)";
    linkDiv.style.width = "26px";
    linkDiv.style.height = "26px";
    linkDiv.style.cssFloat = "left";
    linkDiv.style.backgroundRepeat = "no-repeat";
    linkDiv.style.margin = "8px";

    var countDiv = document.createElement("div");
    countDiv.style.position = "relative";
    countDiv.style.left = "14px";
    countDiv.style.top = "14px";
    countDiv.style.width = "12px";
    countDiv.style.height = "12px";
    countDiv.style.backgroundSize = "cover";

    linkDiv.appendChild(countDiv);
    linkDiv.countMarker = countDiv;

    if (helpid) {
        linkDiv.setAttribute("data-pressgangtopic", helpid);
    }

    return linkDiv;
}

/**
 * Sets the number icon in the bottom right hand corner
 * @param linkDivId The id of the icon to be edited
 * @param count The number to be displayed
 */
function updateCount(linkDivId, count) {

    var linkDivs = jQuery('#' + linkDivId);
    if (linkDivs.length != 0) {
        var linkDiv = linkDivs[0];
        if (count >= 1 && count <= 10) {
            linkDiv.countMarker.style.backgroundImage = "url(/lib/docbuilder-overlay/images/" + count + ".png)";
        } else if (count > 10) {
            linkDiv.countMarker.style.backgroundImage = "url(/lib/docbuilder-overlay/images/10plus.png)";
        } else {
            linkDiv.countMarker.style.backgroundImage = null;
        }
    }
}

/**
 * Create the popover element
 * @param title The title of the popover
 * @param topicId The topic's ID
 * @returns The popover element
 */
function createPopover(title, topicId) {
    var fixedTitle = title.replace(/ /g, "").replace(/\./g, "");

    var popover = document.createElement("div");
    popover.setAttribute("id", topicId + fixedTitle);
    popover.style.position="absolute";
    popover.style.height='300px';
    popover.style.width='750px';
    popover.style.display = 'none';
    popover.style.backgroundColor = 'white';
    popover.style.borderColor = BACKGROUND_COLOR;
    popover.style.borderWidth = '2px';
    popover.style.borderStyle = 'solid';

    var popoverTitle = document.createElement("div");
    popoverTitle.setAttribute("id", topicId + fixedTitle + "title");
    popoverTitle.style.width = "746px";
    popoverTitle.style.height = "42px";
    popoverTitle.style.paddingLeft = "8px";
    popoverTitle.style.color = "white";
    popoverTitle.style.backgroundColor = BACKGROUND_COLOR;
    popoverTitle.style.fontWeight = "bold";
    popoverTitle.style.display = "table-cell";
    popoverTitle.style.verticalAlign = "middle";
    jQuery(popoverTitle).text(title);

    popover.popoverTitle = popoverTitle;

    popover.appendChild(popoverTitle);

    var popoverContent = document.createElement("div");
    popoverContent.setAttribute("id", topicId + fixedTitle + "content");
    popoverContent.style.clear = "both";
    popoverContent.style.margin = "8px";
    popoverContent.style.height = "242px";
    popoverContent.style.overflowY = "auto";
    jQuery(popoverContent).text('Loading...');
    popover.appendChild(popoverContent);

    popover.popoverContent = popoverContent;

    return popover;

}

/**
 * The second pass is run once all the topics have been found, and once the window is loaded or a timeout has been
 * reached. This function will be called three times, but will only run once.
 *
 * @param myTopicsFound Set to true when this function is called after the topics have been found.
 * @param mySecondPassTimeout Set to true when this function is called when the timeout is reached.
 * @param myWindowLoaded Set to true when this function is called when the window is loaded.
 */
function secondPass(myTopicsFound, mySecondPassTimeout, myWindowLoaded) {

    if (myTopicsFound) {
        topicsFound = true;
    } else if (mySecondPassTimeout) {
        secondPassTimeout = true;
    } else if (myWindowLoaded) {
        windowLoaded = true;
    }

    if ((topicsFound && (secondPassTimeout || windowLoaded) && !secondPassCalled)) {
        console.log("Starting second pass.");

        secondPassCalled = true;

        getDictionary();

        asyncJs.waterfall([
            getInfoFromREST,
            getRevisionInfoFromREST,
            getDuplicatedTopics,
            getTopicDetailsInBatches,
            getTopicNodes
        ], function (err, result) {
            // result now equals 'done'
        });

        var specId = getSpecIdFromURL();
        getModifiedTopics(specId);
    }
}

function getTopReusedTopics(specId) {
    var specProductUrl = REST_SERVER + "1/contentspecnodes/get/json/query;csNodeType=7;contentSpecIds=" + specId + "?expand=" + encodeURIComponent("{\"branches\":[{\"trunk\":{\"name\": \"nodes\"}}]}");
    jQuery.getJSON(specProductUrl, function(data) {
        for (var nodeIndex = 0, nodeCount = data.items.length; nodeIndex < nodeCount; ++nodeIndex) {
            var node = data.items[nodeIndex].item;
            if (node.title == "Product") {
                var product = node.additionalText;

                var specsUrl = REST_SERVER + "1/contentspecs/get/json/query;contentSpecProduct=" + encodeURIComponent(product) + "?expand=" + encodeURIComponent("{\"branches\":[{\"trunk\":{\"name\": \"contentSpecs\"}, \"branches\":[{\"trunk\":{\"name\": \"topics\"}, \"branches\":[{\"trunk\":{\"name\": \"contentSpecs_OTM\"}}]}]}]}]}");

                jQuery.getJSON(specsUrl, function(specData) {
                    var relatedContentSpecs = [];
                    for (var specIndex = 0, specCount = specData.items.length; specIndex < specCount; ++specIndex) {
                        var spec =  specData.items[specIndex].item;
                        for (var topicIndex = 0, topicCount = spec.topics.items.length; topicIndex < topicCount; ++topicIndex) {
                            var topic = spec.topics.items[topicIndex].item;
                            for (var specIndex2 = 0, specCount2 = topic.contentSpecs_OTM.items.length; specIndex2 < specCount2; ++specIndex2) {
                                var spec2 = topic.contentSpecs_OTM.items[specIndex2];
                                if (jQuery.inArray(spec2.id, relatedContentSpecs) == -1) {
                                    relatedContentSpecs.push(spec2.id);
                                }
                            }
                        }
                    }
                });

                break;
            }
        }
    });
}

/**
 * Find instances where a topic has been used at a higher revision in another book
 * @param specId
 * @param topics
 * @param async.js callback
 */
function getTopicNodes(specId, topicNodes, callback) {
    var count = 0;

    asyncJs.eachSeries(
        topicNodes.items,
        function(topicNodeContainer, callback) {
            var topicId = topicNodeContainer.item.entityId;
            var topicRev = topicNodeContainer.item.entityRevision;
            var topicNodesUrl = REST_SERVER + "1/contentspecnodes/get/json/query;csNodeEntityId=" + topicId + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22nodes%22%7D%2C%20%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22contentSpec%22%7D%7D%5D%7D%5D%7D%0A%0A";
            jQuery.getJSON(topicNodesUrl, function(topicNodeData) {
                var newerTopicRevisions = [];
                for (var topicNodeIndex = 0, topicNodeCount = topicNodeData.items.length; topicNodeIndex < topicNodeCount; ++topicNodeIndex) {
                    var topicNode = topicNodeData.items[topicNodeIndex].item;
                    if (topicNode.contentSpec.id != specId) {
                        if (topicNode.entityRevision && topicNode.entityRevision > topicRev) {
                            newerTopicRevisions.push({spec: topicNode.contentSpec.id, rev: topicNode.entityRevision});
                        }
                    }
                }

                if (newerTopicRevisions.length != 0) {
                    var button = '<div class="btn-group" style="margin-bottom: 8px;">\
            <button type="button" class="btn btn-default" style="width:230px; white-space: normal;">Topic: ' + topicId + ' Rev: ' + topicRev + '</button>\
            <button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" style="position: absolute; top:0; bottom: 0">\
                <span class="caret"></span>\
            </button>\
            <ul class="dropdown-menu" role="menu">';

                    for (var newerTopicRevisionIndex = 0, newerTopicRevisionCount = newerTopicRevisions.length; newerTopicRevisionIndex < newerTopicRevisionCount; ++newerTopicRevisionIndex) {
                        var newerTopicRevision = newerTopicRevisions[newerTopicRevisionIndex];
                        button += '<li><a href="' + UI_URL + '#TopicHistoryView;' + topicId + ';' + topicRev + ';' + newerTopicRevisions[newerTopicRevisionIndex].rev + '" target="_blank">Spec: ' + newerTopicRevision.spec + " Rev: " + newerTopicRevision.rev + '</a></li>';
                    }

                    button += '</ul>\
            </div>';

                    var buttonEle = jQuery(button);
                    buttonEle.appendTo(jQuery("#topicsUpdatedInOtherSpecsItems"));
                    buttonEle.click(function() {
                        topicSections[topicId].scrollIntoView();
                    });

                    ++count;
                }

                callback();
            });
        },
        function(err) {
            jQuery("#topicsUpdatedInOtherSpecsBadge").remove();
            jQuery('#topicsUpdatedInOtherSpecs').append(jQuery('<span id="topicsUpdatedInOtherSpecsBadge" class="badge pull-right">' + count + '</span>'));
            callback(null);
        }
    );
}

function getModifiedTopics(specId) {
    // get content spec revisions
    var revisionsURL = REST_SERVER + "1/contentspec/get/json/" + specId + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22revisions%22%7D%7D%5D%7D";

    jQuery.getJSON(revisionsURL, function(data) {
        // get the revisions that existed 1 day, week, month, year ago
        for (var index = 0, count = data.revisions.items.length; index < count; ++index) {
            var revision = data.revisions.items[index].item;

            var date = moment(revision.lastModified);

            if (!specRevisionCache.day || (date.isAfter(moment().subtract('day', 1)) && revision.revision < specRevisionCache.day)) {
                specRevisionCache.day = revision.revision;
            }

            if (!specRevisionCache.week || (date.isAfter(moment().subtract('week', 1)) && revision.revision < specRevisionCache.week)) {
                specRevisionCache.week = revision.revision;
            }

            if (!specRevisionCache.month || (date.isAfter(moment().subtract('month', 1)) && revision.revision < specRevisionCache.month)) {
                specRevisionCache.month = revision.revision;
            }

            if (!specRevisionCache.year || (date.isAfter(moment().subtract('year', 1)) && revision.revision < specRevisionCache.year)) {
                specRevisionCache.year = revision.revision;
            }
        }

        // a callback to call when all spec topics are found
        var compareRevisions = function() {
            for (var revisionIndex = 0, revisionCount = specRevisionCache.revisions.length; revisionIndex < revisionCount; ++revisionIndex) {
                var revision = specRevisionCache[specRevisionCache.revisions[revisionIndex]].topics;
                var added = [];
                var removed = [];

                for (revTopicID in revision) {
                    var found = false;
                    for (currentTopicID in specRevisionCache.current.topics) {
                        if (currentTopicID == revTopicID) {
                            found = true;
                            break;
                        }
                    }

                    if (!found) {
                        removed.push(revTopicID);
                    }
                }

                for (currentTopicID in specRevisionCache.current.topics) {
                    var found = false;
                    for (revTopicID in revision) {
                        if (currentTopicID == revTopicID) {
                            found = true;
                            break;
                        }
                    }

                    if (!found) {
                        added.push(currentTopicID);
                    }
                }

                specRevisionCache[specRevisionCache.revisions[revisionIndex]].added = added;
                specRevisionCache[specRevisionCache.revisions[revisionIndex]].removed = removed;
            }

            // at this point we are ready to start the third pass (an email report)
            thirdPass(false, true);

            function createClickHandler(topic) {
                return function() {
                    topicSections[topic].scrollIntoView();
                }
            }

            // add the results to the menu
            jQuery("#topicsAddedSince1DayBadge").remove();
            jQuery('#topicsAddedIn1Day').append(jQuery('<span class="badge pull-right">' + specRevisionCache[specRevisionCache.day].added.length + '</span>'));
            for (var topicIndex = 0, topicCount = specRevisionCache[specRevisionCache.day].added.length; topicIndex < topicCount; ++topicIndex) {
                var topic = specRevisionCache[specRevisionCache.day].added[topicIndex];
                var ele = jQuery('<li><a>' + topic + '</a></li>');
                ele.click(createClickHandler(topic));
                ele.appendTo(jQuery("#topicsAddedSince1DayItems"));
            }

            jQuery("#topicsAddedSince1WeekBadge").remove();
            jQuery('#topicsAddedIn1Week').append(jQuery('<span class="badge pull-right">' + specRevisionCache[specRevisionCache.week].added.length + '</span>'));
            for (var topicIndex = 0, topicCount = specRevisionCache[specRevisionCache.week].added.length; topicIndex < topicCount; ++topicIndex) {
                var topic = specRevisionCache[specRevisionCache.week].added[topicIndex];
                var ele = jQuery('<li><a>' + topic + '</a></li>');
                ele.click(createClickHandler(topic));
                ele.appendTo(jQuery("#topicsAddedSince1WeekItems"));
            }

            jQuery("#topicsAddedSince1MonthBadge").remove();
            jQuery('#topicsAddedIn1Month').append(jQuery('<span class="badge pull-right">' + specRevisionCache[specRevisionCache.month].added.length + '</span>'));
            for (var topicIndex = 0, topicCount = specRevisionCache[specRevisionCache.month].added.length; topicIndex < topicCount; ++topicIndex) {
                var topic = specRevisionCache[specRevisionCache.month].added[topicIndex];
                var ele = jQuery('<li><a>' + topic + '</a></li>');
                ele.click(createClickHandler(topic));
                ele.appendTo(jQuery("#topicsAddedSince1MonthItems"));
            }

            jQuery("#topicsAddedSince1YearBadge").remove();
            jQuery('#topicsAddedIn1Year').append(jQuery('<span class="badge pull-right">' + specRevisionCache[specRevisionCache.year].added.length + '</span>'));
            for (var topicIndex = 0, topicCount = specRevisionCache[specRevisionCache.year].added.length; topicIndex < topicCount; ++topicIndex) {
                var topic = specRevisionCache[specRevisionCache.year].added[topicIndex];
                var ele = jQuery('<li><a>' + topic + '</a></li>');
                ele.click(createClickHandler(topic));
                ele.appendTo(jQuery("#topicsAddedSince1YearItems"));
            }

            jQuery("#topicsRemovedIn1DayBadge").remove();
            jQuery('#topicsRemovedIn1Day').append(jQuery('<span class="badge pull-right">' + specRevisionCache[specRevisionCache.day].removed.length + '</span>'));
            for (var topicIndex = 0, topicCount = specRevisionCache[specRevisionCache.day].removed.length; topicIndex < topicCount; ++topicIndex) {
                var topic = specRevisionCache[specRevisionCache.day].removed[topicIndex];
                var ele = jQuery('<li><a>' + topic + '</a></li>');
                ele.click(createClickHandler(topic));
                ele.appendTo(jQuery("#topicsRemovedSince1DayItems"));
            }

            jQuery("#topicsRemovedIn1WeekBadge").remove();
            jQuery('#topicsRemovedIn1Week').append(jQuery('<span class="badge pull-right">' + specRevisionCache[specRevisionCache.week].removed.length + '</span>'));
            for (var topicIndex = 0, topicCount = specRevisionCache[specRevisionCache.week].removed.length; topicIndex < topicCount; ++topicIndex) {
                var topic = specRevisionCache[specRevisionCache.week].removed[topicIndex];
                var ele = jQuery('<li><a>' + topic + '</a></li>');
                ele.click(createClickHandler(topic));
                ele.appendTo(jQuery("#topicsRemovedSince1WeekItems"));
            }

            jQuery("#topicsRemovedIn1MonthBadge").remove();
            jQuery('#topicsRemovedIn1Month').append(jQuery('<span class="badge pull-right">' + specRevisionCache[specRevisionCache.month].removed.length + '</span>'));
            for (var topicIndex = 0, topicCount = specRevisionCache[specRevisionCache.month].removed.length; topicIndex < topicCount; ++topicIndex) {
                var topic = specRevisionCache[specRevisionCache.month].removed[topicIndex];
                var ele = jQuery('<li><a>' + topic + '</a></li>');
                ele.click(createClickHandler(topic));
                ele.appendTo(jQuery("#topicsRemovedSince1MonthItems"));
            }

            jQuery("#topicsRemovedIn1YearBadge").remove();
            jQuery('#topicsRemovedIn1Year').append(jQuery('<span class="badge pull-right">' + specRevisionCache[specRevisionCache.year].removed.length + '</span>'));
            for (var topicIndex = 0, topicCount = specRevisionCache[specRevisionCache.year].removed.length; topicIndex < topicCount; ++topicIndex) {
                var topic = specRevisionCache[specRevisionCache.year].removed[topicIndex];
                var ele = jQuery('<li><a>' + topic + '</a></li>');
                ele.click(createClickHandler(topic));
                ele.appendTo(jQuery("#topicsRemovedSince1YearItems"));
            }

            // create the graphs
            var values = [
                specRevisionCache[specRevisionCache.day].added.length,
                specRevisionCache[specRevisionCache.week].added.length,
                specRevisionCache[specRevisionCache.month].added.length,
                specRevisionCache[specRevisionCache.year].added.length];

            var labels = ["day", "week", "month", "year"];
            var colors = [Raphael.rgb(0, 254, 254), Raphael.rgb(0, 254, 0), Raphael.rgb(254, 254, 0), Raphael.rgb(254, 127, 0)];

            var offscreenDiv = jQuery('<div id="topicsAddedSinceChart"></div>');
            offscreenDiv.appendTo(offscreenRendering);

            setTimeout(function(offscreenDiv, values, labels, colors) {
                return function(){
                    Raphael("topicsAddedSinceChart", 250, 250).pieChart(125, 125, 50, values, labels, colors, 30, 30, 16, "#fff");
                    jQuery(offscreenDiv).appendTo(jQuery("#topicsAddedSincePanel"));
                }
            }(offscreenDiv, values, labels, colors), 0);


            var values = [
                specRevisionCache[specRevisionCache.day].removed.length ,
                specRevisionCache[specRevisionCache.week].removed.length,
                specRevisionCache[specRevisionCache.month].removed.length,
                specRevisionCache[specRevisionCache.year].removed.length];

            var offscreenDiv = jQuery('<div id="topicsRemovedSinceChart"></div>');
            offscreenDiv.appendTo(offscreenRendering);

            setTimeout(function(offscreenDiv, values, labels, colors) {
                return function(){
                    Raphael("topicsRemovedSinceChart", 250, 250).pieChart(125, 125, 50, values, labels, colors, 30, 30, 16, "#fff");
                    jQuery(offscreenDiv).appendTo(jQuery("#topicsRemovedSincePanel"));
                }
            }(offscreenDiv, values, labels, colors), 0);

        }

        // keep a track of how many async calls are to be made and have been made
        var callsToMake = 2;
        var callsMade = 0;
        if (specRevisionCache.week != specRevisionCache.day) {
            ++callsToMake;
        }
        if (specRevisionCache.month != specRevisionCache.week) {
            ++callsToMake;
        }
        if (specRevisionCache.year != specRevisionCache.month) {
            ++callsToMake;
        }

        // get topic for current revision
        getTopicsFromSpec(specId, function(data){
            specRevisionCache.current = {topics: data};
            ++callsMade;
            if (callsMade == callsToMake) {
                compareRevisions();
            }
        });

        // get topics for the previous revisions

        // specRevisionCache.revisions is a list of the revisions that we will be processing. It is
        // there for convenience so we can loop over it later.
        specRevisionCache.revisions = [specRevisionCache.day];
        getTopicsFromSpecAndRevision(specId, specRevisionCache.day, function(data) {
            specRevisionCache[specRevisionCache.day] = {topics: data};
            ++callsMade;
            if (callsMade == callsToMake) {
                compareRevisions();
            }
        });

        if (specRevisionCache.week != specRevisionCache.day) {
            specRevisionCache.revisions.push(specRevisionCache.week);
            getTopicsFromSpecAndRevision(specId, specRevisionCache.week, function(data) {
                specRevisionCache[specRevisionCache.week] = {topics: data};
                ++callsMade;
                if (callsMade == callsToMake) {
                    compareRevisions();
                }
            });
        }

        if (specRevisionCache.month != specRevisionCache.week) {
            specRevisionCache.revisions.push(specRevisionCache.month);
            getTopicsFromSpecAndRevision(specId, specRevisionCache.month, function(data) {
                specRevisionCache[specRevisionCache.month] = {topics: data};
                ++callsMade;
                if (callsMade == callsToMake) {
                    compareRevisions();
                }
            });
        }

        if (specRevisionCache.year != specRevisionCache.month) {
            specRevisionCache.revisions.push(specRevisionCache.year);
            getTopicsFromSpecAndRevision(specId, specRevisionCache.year, function(data) {
                specRevisionCache[specRevisionCache.year] = {topics: data};
                ++callsMade;
                if (callsMade == callsToMake) {
                    compareRevisions();
                }
            });
        }

        // get added and removed topics
    });
}

/**
 * Get all the topics from a spec revision
 * @param specId The spec ID
 * @param revision The spec revision
 * @param callback The callback to call when all the topics are found
 */
function getTopicsFromSpecAndRevision(specId, revision, callback) {
    var spec = REST_SERVER + "1/contentspec/get/json/" + specId + "/r/" + revision + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22children_OTM%22%7D%7D%5D%7D";
    var topics = {};

    jQuery.getJSON(spec, function(data) {
        var callsCompleted = 0;
        var count = data.children_OTM.items.length;
        if (count == 0) {
            callback(topics)
        } else {
            for (var index = 0, count = data.children_OTM.items.length; index < count; ++index) {
                var child = data.children_OTM.items[index].item;
                expandSpecChildren(topics, child.id, child.revision, function(){
                    ++callsCompleted;
                    if (callsCompleted == count) {
                        callback(topics);
                    }
                });
            }
        }
    });
}

/**
 * Get all the topics from a spec
 * @param specId The spec ID
 * @param callback The callback to call when all the topics are found
 */
function getTopicsFromSpec(specId, callback) {
    var specRevision = REST_SERVER + "1/contentspec/get/json/" + specId + "/?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22children_OTM%22%7D%7D%5D%7D";
    var topics = {};

    jQuery.getJSON(specRevision, function(data) {
        var callsCompleted = 0;
        var count = data.children_OTM.items.length;
        if (count = 0) {
            callback(topics);
        } else {
            for (var index = 0, count = data.children_OTM.items.length; index < count; ++index) {
                var child = data.children_OTM.items[index].item;
                expandSpecChildren(topics, child.id, child.revision, function(){
                    ++callsCompleted;
                    if (callsCompleted == count) {
                        callback(topics);
                    }
                });
            }
        }
    });
}

/**
 * Returning the children of a spec involves recursivly expanding each child CSNode.
 * @param topics The collection of topics
 * @param nodeId The cs node to expand
 * @param revision The cs node revision
 * @param callback The callback to call when this child has been fully expanded
 */
function expandSpecChildren(topics, nodeId, revision, callback) {
    var children = REST_SERVER + "1/contentspecnode/get/json/" + nodeId + "/r/" + revision + "/?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22children_OTM%22%7D%7D%5D%7D";

    jQuery.getJSON(children, function(data) {
        var childCallsCompleted = 0;
        var childrenToExpand = [];

        for (var index = 0, count = data.children_OTM.items.length; index < count; ++index) {
            var child = data.children_OTM.items[index].item;

            if (child.nodeType = "TOPIC" && child.entityId != null) {
                if (!topics[child.entityId]) {
                    topics[child.entityId] = 1;
                } else {
                    ++topics[child.entityId];
                }
            } else {
                childrenToExpand.push({id: child.id, revision: child.revision})
            }
        }

        // expand the children
        if (childrenToExpand.length == 0) {
            callback();
        } else {
            for (var index = 0, count = childrenToExpand.length; index < count; ++index) {
                expandSpecChildren(topics, childrenToExpand[index].id, childrenToExpand[index].revision, function() {
                    ++childCallsCompleted;
                    if (childCallsCompleted == childrenToExpand.length) {
                        callback();
                    }
                });
            }
        }
    });
}

/**
 * The third pass is done once every topic has been returned and the details extracted from them. We can then
 * read this information display some additional reports.
 * @param mySecondPassDone
 * @param mySpecHistoryDone
 */
function thirdPass(mySecondPassDone, mySpecHistoryDone) {
    if (mySecondPassDone) {
        secondPassDone = true;
    }

    if (mySpecHistoryDone) {
        specHistoryDone = true;
    }

    if (secondPassDone && specHistoryDone) {

        console.log("Starting Third Pass");

        // the function to call when all incompatibilities have been found
        var reportIncompatibilities = function(usedLicenses, incompatibleLicenses) {

            jQuery('#licensesPresent').append(jQuery('<span class="badge pull-right">' + countKeys(usedLicenses) + '</span>'));

            for (var tag in usedLicenses) {

                jQuery('<li><a href="javascript:hideAllMenus(); sideMenus[\'' + usedLicenses[tag].name + '\'].show();">' + usedLicenses[tag].name + '<span class="badge pull-right">' + usedLicenses[tag].topics.length + '</span></a></li>').appendTo(jQuery("#licensesPresentItems"));

                var newMenuString = '\
                <div class="panel panel-default pressgangMenu">\
                    <div class="panel-heading">' + usedLicenses[tag].name + '</div>\
                        <div class="panel-body ">\
                            <ul id="licenseConflictsItems" class="nav nav-pills nav-stacked">\
                                <li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
                                <li><a href="javascript:hideAllMenus(); licenses.show(); localStorage.setItem(\'lastMenu\', \'licenses\');">&lt;- Licenses</a></li>\
                                <li><a href="javascript:hideAllMenus(); licensesPresent.show(); localStorage.setItem(\'lastMenu\', \'licensesPresent\');">&lt;- Licenses Present</a></li>';

                for (var licenceTopicIndex = 0, licenseTopicCount = usedLicenses[tag].topics.length; licenceTopicIndex < licenseTopicCount; ++licenceTopicIndex) {
                    var topicID = usedLicenses[tag].topics[licenceTopicIndex];
                    var topicName = topicNames[topicID];

                    newMenuString += '<li><a href="javascript:topicSections[' + topicID + '].scrollIntoView()">' + topicName + '</a></li>';
                }

                newMenuString += '</ul>\
                        </div>\
                    </div>\
                </div>'

                var licenseMenu =  jQuery(newMenuString);
                // so we can reference this menu in code
                sideMenus[usedLicenses[tag].name] = licenseMenu
                // so all menus will be closed
                sideMenus.push(licenseMenu);
                jQuery(document.body).append(licenseMenu);
                licenseMenu.hide();
            }

            var licenseConflictCount = 0;
            for (var licenseIndex = 0, licenseCount = incompatibleLicenses.length; licenseIndex < licenseCount; ++licenseIndex) {
                var licenseDetails = incompatibleLicenses[licenseIndex];
                if (usedLicenses[licenseDetails.license1] && usedLicenses[licenseDetails.license2]) {
                    ++licenseConflictCount;
                    jQuery('<li><a href="' + UI_URL + '#SearchResultsAndTopicView;query;topicIds=' + licenseDetails.topicId + '">' + usedLicenses[licenseDetails.license1].name + " / " + usedLicenses[licenseDetails.license2].name + '</a></li>').appendTo(jQuery("#licenseConflictsItems"));
                }
            }

            jQuery('#licenseConflicts').append(jQuery('<span class="badge pull-right">' + licenseConflictCount + '</span>'));
        }

        // find all the tags in the license category
        var categoryQuery = REST_SERVER + "1/category/get/json/" + LICENSE_CATEGORY + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A+%22tags%22%7D%7D%5D%7D";
        jQuery.getJSON(categoryQuery, function(data) {

            // extract all the license tags
            var licenseTags = [];
            for (var tagIndex = 0, tagCount = data.tags.items.length; tagIndex < tagCount; ++tagIndex) {
                var tagId = data.tags.items[tagIndex].item.id;
                if (tagId != LICENSE_INCOMPATIBILITY_TAG && tagId != LICENSE_COMPATIBILITY_TAG) {
                    licenseTags.push(tagId);
                }
            }

            //find out what licenses we are actually using
            var usedLicenses = {};
            for (var topic in tagsCache) {
                for (var tagIndex = 0, tagCount = tagsCache[topic].data.length; tagIndex < tagCount; ++tagIndex) {
                    var tag = tagsCache[topic].data[tagIndex];
                    if (jQuery.inArray(tag.id, licenseTags) != -1) {
                        if (!usedLicenses[tag.id]) {
                            usedLicenses[tag.id] = {name: tag.name, topics: [topic]};
                        } else {
                            usedLicenses[tag.id].topics.push(topic);
                        }
                    }
                }
            }

            // build up a map of what licenses are compatible or not
            var incompatibleLicenses = [];
            var queryCount = factorial(licenseTags.length) / (factorial(2) * (factorial(licenseTags.length - 2)));
            var queryCompleted = 0;

            for (var licenseIndex = 0, licenseCount = licenseTags.length - 1; licenseIndex < licenseCount; ++licenseIndex) {
                for (var licenseIndex2 = licenseIndex + 1, licenseCount2 = licenseTags.length; licenseIndex2 < licenseCount2; ++licenseIndex2) {
                    var license1 = licenseTags[licenseIndex];
                    var license2 = licenseTags[licenseIndex2];
                    var query = REST_SERVER + "1/topics/get/json/query;catint" + LICENSE_CATEGORY + "=And;tag" + LICENSE_INCOMPATIBILITY_TAG + "=1;tag" + license1 + "=1;tag" + license2 + "=1;logic=And?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22topics%22%7D%7D%5D%7D";

                    jQuery.getJSON(query, function(license1, license2) {
                        return function(topics) {
                            ++queryCompleted;
                            if (topics.items.length != 0) {
                                incompatibleLicenses.push({license1: license1, license2: license2, topicId: topics.items[0].item.id});
                            }

                            if (queryCompleted ==  queryCount) {
                                reportIncompatibilities(usedLicenses, incompatibleLicenses);
                            }
                        }
                    }(license1, license2));
                }
            }
        });
    }
}

function factorial(num)
{
    var rval=1;
    for (var i = 2; i <= num; i++)
        rval = rval * i;
    return rval;
}

/**
 * Builds the Raphael pie chart showing when topics were last edited.
 */
function buildTopicEditedInChart() {
    historyCache.summary = {};
    historyCache.summary.day = 0;
    historyCache.summary.week = 0;
    historyCache.summary.month = 0;
    historyCache.summary.year = 0;
    historyCache.summary.older = 0;
    historyCache.summary.count = topicIds.length;

    var totalCount = 0;

    for (var index = 0; index < historyCache.summary.count; ++index) {
        if (historyCache[topicIds[index]].data) {
            var topic = historyCache[topicIds[index]].data[0];
            var date = moment(topic.lastModified);

            if (date.isAfter(moment().subtract('day', 1))) {
                ++historyCache.summary.day;
                ++totalCount;
            }

            if (date.isAfter(moment().subtract('week', 1))) {
                ++historyCache.summary.week;
                ++totalCount;
            }

            if (date.isAfter(moment().subtract('month', 1))) {
                ++historyCache.summary.month;
                ++totalCount;
            }

            if (date.isAfter(moment().subtract('year', 1))) {
                ++historyCache.summary.year;
                ++totalCount;
            }

            ++historyCache.summary.older;
            ++totalCount;
        }
    }

    jQuery('#topicsEditedIn1Day').append(jQuery('<span class="badge pull-right">' + historyCache.summary.day + '</span>'));
    jQuery('#topicsEditedIn1Week').append(jQuery('<span class="badge pull-right">' + historyCache.summary.week + '</span>'));
    jQuery('#topicsEditedIn1Month').append(jQuery('<span class="badge pull-right">' + historyCache.summary.month + '</span>'));
    jQuery('#topicsEditedIn1Year').append(jQuery('<span class="badge pull-right">' + historyCache.summary.year + '</span>'));
    jQuery('#topicsEditedInOlderThanYear').append(jQuery('<span class="badge pull-right">' + historyCache.summary.older + '</span>'));

    var values = [
        historyCache.summary.day / totalCount * 100.0,
        historyCache.summary.week / totalCount * 100.0,
        historyCache.summary.month / totalCount * 100.0,
        historyCache.summary.year / totalCount * 100.0,
        historyCache.summary.older / totalCount * 100.0];

    var labels = ["day", "week", "month", "year", "older"];
    var colors = [Raphael.rgb(0, 254, 254), Raphael.rgb(0, 254, 0), Raphael.rgb(254, 254, 0), Raphael.rgb(254, 127, 0), Raphael.rgb(254, 0, 0)];

    var offscreenDiv = jQuery('<div id="topicEditedInChart"></div>');
    offscreenDiv.appendTo(offscreenRendering);

    setTimeout(function(offscreenDiv, values, labels, colors) {
        return function(){
            Raphael("topicEditedInChart", 250, 250).pieChart(125, 125, 50, values, labels, colors, 30, 30, 16, "#fff");
            jQuery(offscreenDiv).appendTo(jQuery("#topicsEditedInPanel"));
        }
    }(offscreenDiv, values, labels, colors), 0);
}

/**
 * Hides all the side bar menus
 */
function hideAllMenus() {
    for (var menuIndex = 0, menuCount = sideMenus.length; menuIndex < menuCount; ++menuIndex) {
        sideMenus[menuIndex].hide();
    }
}

/**
 * When the side menu is visible, we adjust the margin on the document so that it
 * appears to the right of the menu.
 */
function showMenu() {
    document.body.style.margin = scheduleHeight + "px auto auto auto";
    jQuery("#timelineChartDiv").css("display", "");
    jQuery("#productpagestodaybutton").css("display", "");
    jQuery("#pressgangschedulelegend").css("display", "");
    jQuery("#pressgangscheduleprocessname").css("display", "");
    jQuery("#openpressgangmenu").css("display", "none");
}

/**
 * When the menu is hidden, we reset the margins to the defulats used by Publican.
 */
function hideMenu() {
    document.body.style.margin = "0px auto";
    jQuery("#timelineChartDiv").css("display", "none");
    jQuery("#pressgangschedulelegend").css("display", "none");
    jQuery("#pressgangscheduleprocessname").css("display", "none");
    jQuery("#productpagestodaybutton").css("display", "none");
    jQuery("#openpressgangmenu").css("display", "");
}

function hideSubMenu() {
    hideAllMenus();
    mainMenu.show();
    localStorage.setItem('lastMenu', 'mainMenu');
}

function showSubMenu(menu, menuName) {
    hideAllMenus();
    menu.show();
    localStorage.setItem('lastMenu', menuName);
}

/**
 * Builds the main menu for the overlay
 *
 * @param help The help button html content.
 * @returns {Object}
 */
function buildMainMenu(help) {
    var mainMenu = jQuery('\
<div class="panel panel-default pressgangMenu">\
    <div class="panel-heading">' + help + 'PressGang</div>\
        <div class="panel-body ">\
            <ul class="nav nav-pills nav-stacked">\
            </ul>\
        </div>\
    </div>\
</div>');

    // Create the menu items
    var hideMenuItem = jQuery('<li><a>Hide Menu</a></li>');
    var topicsByLastEditMenuItem = jQuery('<li data-pressgangtopic="24793" style="background-color: white"><a>Topics By Last Edit</a></li>');
    var topicsAddedMenuItem = jQuery('<li data-pressgangtopic="24794" style="background-color: white"><a>Topics Added In</a></li>');
    var topicsRemovedMenuItem = jQuery('<li data-pressgangtopic="24792" style="background-color: white"><a>Topics Removed In</a></li>');
    var licensesMenuItem = jQuery('<li data-pressgangtopic="24800" style="background-color: white"><a>Licenses</a></li>');

    var bugzillaBugsMenuItem = jQuery('<li data-pressgangtopic="24787" style="background-color: white"><a id="bugzillaBugs">Bugzilla Bugs<span id="bugzillaBugsBadge" class="badge alert-badge pull-right">' + MISSING_SCRIPT + '</span></a></li>');

    var topicsUpdatedInOtherSpecsMenuItem = jQuery('<li data-pressgangtopic="24789" style="background-color: white"><a id="topicsUpdatedInOtherSpecs">Updated Topics<span id="topicsUpdatedInOtherSpecsBadge" class="badge pull-right">' + PROCESSING_MESSAGE + '</span></a></li>');

    var duplicatedTopicsMenuItem = jQuery('<li style="background-color: white"><a id="duplicatedTopics">Duplicated Topics<span id="duplicatedTopicsBadge" class="badge pull-right">' + PROCESSING_MESSAGE + '</span></a></li>');

    var spellingErrorsMenuItem = jQuery('<li style="background-color: white"><a id="spellingErrors">Spelling Errors</a></li>');
    var doubledWordsMenuItem = jQuery('<li style="background-color: white"><a id="doubledWordsErrors">Doubled Words</a></li>');
    var badLinksMenuItem = jQuery('<li style="background-color: white"><a id="badLinks">Bad Links<span id="badLinksBadge" class="badge alert-badge pull-right">' + MISSING_SCRIPT + '</span></a></li>');

    var reportABugMenuItem = jQuery('<li style="background-color: white"><a href="' + BUG_LINK + '&cf_build_id=Content%20Spec%20ID:%20' + SPEC_ID + '">Report a bug</a></li>');
    var editLinkMenuItem = jQuery('<li style="background-color: white"><a href="' + UI_URL + '#ContentSpecFilteredResultsAndContentSpecView;query;contentSpecIds=' + SPEC_ID + '">Edit this spec</a></li>');

    // Add the click handlers
    hideMenuItem.find("a").click(function() {
        showSubMenu(menuIcon, "menuIcon");
        hideMenu();
    });

    topicsByLastEditMenuItem.find("a").click(function() {
        showSubMenu(topicsByLastEdit, "topicsByLastEdit");
    });

    topicsAddedMenuItem.find("a").click(function() {
        showSubMenu(topicsAddedSince, "topicsAddedSince");
    });

    topicsRemovedMenuItem.find("a").click(function() {
        showSubMenu(topicsRemovedSince, "topicsRemovedSince");
    });

    licensesMenuItem.find("a").click(function() {
        showSubMenu(licenses, "licenses");
    });

    bugzillaBugsMenuItem.find("a").click(function() {
        showSubMenu(bugzillaBugs, "bugzillaBugs");
    });

    topicsUpdatedInOtherSpecsMenuItem.find("a").click(function() {
        showSubMenu(topicsUpdatedInOtherSpecs, "topicsUpdatedInOtherSpecs");
    });

    duplicatedTopicsMenuItem.find("a").click(function() {
        showSubMenu(duplicatedTopics, "duplicatedTopics");
    });

    spellingErrorsMenuItem.find("a").click(function() {
        showSubMenu(spellingErrors, "spellingErrors");
    });

    doubledWordsMenuItem.find("a").click(function() {
        showSubMenu(doubledWords, "doubledWords");
    });

    badLinksMenuItem.find("a").click(function() {
        showSubMenu(badLinks, "badLinks");
    });

    // Add the menu items to the main menu
    var parent = mainMenu.find(".nav");
    parent.append(hideMenuItem);
    parent.append(topicsByLastEditMenuItem);
    parent.append(topicsAddedMenuItem);
    parent.append(topicsRemovedMenuItem);
    parent.append(licensesMenuItem);
    parent.append(bugzillaBugsMenuItem);
    parent.append(topicsUpdatedInOtherSpecsMenuItem);
    parent.append(duplicatedTopicsMenuItem);
    parent.append(spellingErrorsMenuItem);
    parent.append(doubledWordsMenuItem);
    parent.append(badLinksMenuItem);
    parent.append(reportABugMenuItem);
    parent.append(editLinkMenuItem);

    return mainMenu;
}

function buildMenuIcon() {
    var menuIcon = jQuery('<div id="openpressgangmenu" style="cursor: pointer; position: fixed; top: 8px; left: 8px; width: 64px; height: 64px; background-image: url(/lib/docbuilder-overlay/images/pressgang.svg); background-size: contain"></div>')
    menuIcon.click(function() {
        hideSubMenu();
        showMenu();
    });

    return menuIcon;
}

function buildGenericChildMenu(help, title, id, helpId) {
    var helpContent = helpId ? ("data-pressgangtopic=\"" + helpId + "\" ") : "";
    var menu = jQuery('\
<div ' + helpContent + 'class="panel panel-default pressgangMenu">\
    <div class="panel-heading">' + help + title + '</div>\
        <div class="panel-body ">\
            <ul id="' + id + '" class="nav nav-pills nav-stacked">\
                <li><a>&lt;- Main Menu</a></li>\
            </ul>\
        </div>\
    </div>\
</div>');

    // Add the click handler
    menu.find("#" + id).find("a").click(hideSubMenu);

    return menu;
}

function buildBadLinksMenu(help) {
    var badLinks = jQuery('\
<div class="panel panel-default pressgangMenu">\
    <div class="panel-heading">' + help + 'Bad Links</div>\
        <div class="panel-body ">\
            <ul id="badLinksItems" class="nav nav-pills nav-stacked">\
                <li><a>&lt;- Main Menu</a></li>\
                <li><a id="badLinksBugzillaBugsPlaceholder" class="alert-badge" href="/PressZilla.user.js">This menu requires the PressZilla GreaseMonkey Extension. Click here to install.</a></li>\
            </ul>\
        </div>\
    </div>\
</div>');

    // Add the click handler
    badLinks.find("#badLinksItems").first().first().click(hideSubMenu);

    return badLinks;
}

function buildSpellingErrorsMenu(help) {
    var spellingErrors = jQuery('\
<div class="panel panel-default pressgangMenu">\
    <div class="panel-heading">' + help + 'Spelling Errors</div>\
        <div class="panel-body ">\
            <ul id="spellingErrorsItems" class="nav nav-pills nav-stacked">\
                <li><a>&lt;- Main Menu</a></li>\
                <li><a>Add custom word to dictionary</a></li>\
                <li><a>Add invalid word to dictionary</a></li>\
                <li><a>Add discouraged word to dictionary</a></li>\
                <li><a>Add discouraged phrase to dictionary</a></li>\
            </ul>\
        </div>\
    </div>\
</div>');

    // Add the click handler
    spellingErrors.find("#spellingErrorsItems a").each(function(index, element) {
        jQuery(element).click(function() {
            if (index === 0) {
                hideSubMenu();
            } else if (index === 1) {
                addCustomWord(VALID_WORD_EXTENDED_PROPERTY_TAG_ID);
            } else if (index === 2) {
                addCustomWord(INVALID_WORD_EXTENDED_PROPERTY_TAG_ID);
            } else if (index === 3) {
                addCustomWord(DISCOURAGED_WORD_EXTENDED_PROPERTY_TAG_ID);
            } else if (index === 4) {
                addCustomWord(DISCOURAGED_PHRASE_EXTENDED_PROPERTY_TAG_ID);
            }
        });
    });

    return spellingErrors;
}

function buildTopicsAddedSinceMenu(help) {
    var topicsAddedSince = jQuery('\
<div data-pressgangtopic="24794" class="panel panel-default pressgangMenu">\
    <div class="panel-heading">' + help + 'Topics Added In</div>\
        <div id="topicsAddedSincePanel" class="panel-body ">\
            <ul class="nav nav-pills nav-stacked">\
                <li><a>&lt;- Main Menu</a></li>\
                <li ><a id="topicsAddedIn1Day"><div style="background-image: url(/lib/docbuilder-overlay/images/history-blue.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Day<span id="topicsAddedSince1DayBadge" class="badge pull-right">' + PROCESSING_MESSAGE + '</span></a></li>\
                <li ><a id="topicsAddedIn1Week"><div style="background-image: url(/lib/docbuilder-overlay/images/history-green.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Week<span id="topicsAddedSince1WeekBadge" class="badge pull-right">' + PROCESSING_MESSAGE + '</span></a></li>\
                <li ><a id="topicsAddedIn1Month"><div style="background-image: url(/lib/docbuilder-overlay/images/history-yellow.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Month<span id="topicsAddedSince1MonthBadge" class="badge pull-right">' + PROCESSING_MESSAGE + '</span></a></li>\
                <li ><a id="topicsAddedIn1Year"><div style="background-image: url(/lib/docbuilder-overlay/images/history-orange.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Year<span id="topicsAddedSince1YearBadge" class="badge pull-right">' + PROCESSING_MESSAGE + '</span></a></li>\
            </ul>\
        </div>\
    </div>\
</div>');

    // Add the click handler
    topicsAddedSince.find("#topicsAddedSincePanel a").each(function(index, element) {
        if (index === 0) {
            jQuery(element).click(hideSubMenu);
        } else if (index === 1) {
            jQuery(element).click(function() {
                showSubMenu(topicsAddedSince1Day, "topicsAddedSince1Day");
            });
        } else if (index === 2) {
            jQuery(element).click(function() {
                showSubMenu(topicsAddedSince1Week, "topicsAddedSince1Week");
            });
        } else if (index === 3) {
            jQuery(element).click(function() {
                showSubMenu(topicsAddedSince1Month, "topicsAddedSince1Month");
            });
        } else if (index === 4) {
            jQuery(element).click(function() {
                showSubMenu(topicsAddedSince1Year, "topicsAddedSince1Year");
            });
        }
    });

    return topicsAddedSince;
}

function buildTopicsRemovedSinceMenu(help) {
    var topicsRemovedSince = jQuery('\
<div data-pressgangtopic="24792" class="panel panel-default pressgangMenu">\
    <div class="panel-heading">' + help + 'Topics Removed Since</div>\
        <div id="topicsRemovedSincePanel" class="panel-body ">\
            <ul class="nav nav-pills nav-stacked">\
                <li><a>&lt;- Main Menu</a></li>\
                <li ><a id="topicsRemovedIn1Day"><div style="background-image: url(/lib/docbuilder-overlay/images/history-blue.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Day<span id="topicsRemovedIn1DayBadge" class="badge pull-right">' + PROCESSING_MESSAGE + '</span></a></li>\
                <li ><a id="topicsRemovedIn1Week"><div style="background-image: url(/lib/docbuilder-overlay/images/history-green.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Week<span id="topicsRemovedIn1WeekBadge" class="badge pull-right">' + PROCESSING_MESSAGE + '</span></a></li>\
                <li ><a id="topicsRemovedIn1Month"><div style="background-image: url(/lib/docbuilder-overlay/images/history-yellow.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Month<span id="topicsRemovedIn1MonthBadge" class="badge pull-right">' + PROCESSING_MESSAGE + '</span></a></li>\
                <li ><a id="topicsRemovedIn1Year"><div style="background-image: url(/lib/docbuilder-overlay/images/history-orange.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Year<span id="topicsRemovedIn1YearBadge" class="badge pull-right">' + PROCESSING_MESSAGE + '</span></a></li>\
            </ul>\
        </div>\
    </div>\
</div>');

    // Add the click handler
    topicsRemovedSince.find("#topicsRemovedSincePanel a").each(function(index, element) {
        if (index === 0) {
            jQuery(element).click(hideSubMenu);
        } else if (index === 1) {
            jQuery(element).click(function() {
                showSubMenu(topicsRemovedSince1Day, "topicsRemovedSince1Day");
            });
        } else if (index === 2) {
            jQuery(element).click(function() {
                showSubMenu(topicsRemovedSince1Week, "topicsRemovedSince1Week");
            });
        } else if (index === 3) {
            jQuery(element).click(function() {
                showSubMenu(topicsRemovedSince1Month, "topicsRemovedSince1Month");
            });
        } else if (index === 4) {
            jQuery(element).click(function() {
                showSubMenu(topicsRemovedSince1Year, "topicsRemovedSince1Year");
            });
        }
    });

    return topicsRemovedSince;
}

function buildTopicsLastEditMenu(help) {
    var topicsLastEdit = jQuery('\
<div data-pressgangtopic="24793" class="panel panel-default pressgangMenu">\
    <div class="panel-heading">' + help + 'Topics By Last Edit</div>\
        <div id="topicsEditedInPanel" class="panel-body ">\
            <ul class="nav nav-pills nav-stacked">\
                <li><a>&lt;- Main Menu</a></li>\
                <li ><a id="topicsEditedIn1Day"><div style="background-image: url(/lib/docbuilder-overlay/images/history-blue.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Day</a></li>\
                <li ><a id="topicsEditedIn1Week"><div style="background-image: url(/lib/docbuilder-overlay/images/history-green.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Week</a></li>\
                <li ><a id="topicsEditedIn1Month"><div style="background-image: url(/lib/docbuilder-overlay/images/history-yellow.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Month</a></li>\
                <li ><a id="topicsEditedIn1Year"><div style="background-image: url(/lib/docbuilder-overlay/images/history-orange.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Year</a></li>\
                <li ><a id="topicsEditedInOlderThanYear"><div style="background-image: url(/lib/docbuilder-overlay/images/history-red.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>Older than a year</a></li>\
            </ul>\
        </div>\
    </div>\
</div>');

    // Add the click handler
    topicsLastEdit.find("#topicsEditedInPanel a").each(function(index, element) {
        if (index === 0) {
            jQuery(element).click(hideSubMenu);
        } else if (index === 1) {
            jQuery(element).click(function() {
                showSubMenu(topicsEditedIn1Day, "topicsEditedIn1Day");
            });
        } else if (index === 2) {
            jQuery(element).click(function() {
                showSubMenu(topicsEditedIn1Week, "topicsEditedIn1Week");
            });
        } else if (index === 3) {
            jQuery(element).click(function() {
                showSubMenu(topicsEditedIn1Month, "topicsEditedIn1Month");
            });
        } else if (index === 4) {
            jQuery(element).click(function() {
                showSubMenu(topicsEditedIn1Year, "topicsEditedIn1Year");
            });
        } else if (index === 5) {
            jQuery(element).click(function() {
                showSubMenu(topicsEditedInOlderThanYear, "topicsEditedInOlderThanYear");
            });
        }
    });

    return topicsLastEdit;
}

function buildGenericChildSubMenu(help, title, id, helpId, parentTitle, parentMenu, parentMenuName) {
    var helpContent = helpId ? ("data-pressgangtopic=\"" + helpId + "\" ") : "";

    var subMenu = jQuery('\
<div ' + helpContent + 'class="panel panel-default pressgangMenu">\
    <div class="panel-heading">' + help + title + '</div>\
        <div class="panel-body ">\
            <ul id="' + id + '" class="nav nav-pills nav-stacked">\
                <li><a>&lt;- Main Menu</a></li>\
                <li><a>&lt;- ' + parentTitle + '</a></li>\
            </ul>\
        </div>\
    </div>\
</div>');

    // Add the click handler
    subMenu.find("#" + id + " > a").each(function(index, element) {
        if (index === 0) {
            jQuery(element).click(hideSubMenu);
        } else if (index === 1) {
            jQuery(element).click(function() {
                showSubMenu(parentMenu, parentMenuName);
            });
        }
    });

    return subMenu;
}

function buildLicensesMenu(help) {
    var licensesMenu = jQuery('\
<div data-pressgangtopic="24800" class="panel panel-default pressgangMenu">\
    <div class="panel-heading">' + help + 'Licenses</div>\
        <div class="panel-body ">\
            <ul class="nav nav-pills nav-stacked">\
                <li><a>&lt;- Main Menu</a></li>\
                <li><a id="licensesPresent">Licenses Present</a></li>\
                <li><a id="licenseConflicts">License Conflicts</a></li>\
            </ul>\
        </div>\
    </div>\
</div>');

    // Add the click handler
    licensesMenu.find("a").each(function(index, element) {
        if (index === 0) {
            jQuery(element).click(hideSubMenu);
        } else if (index === 1) {
            jQuery(element).click(function() {
                showSubMenu(licensesPresent, "licensesPresent");
            });
        } else if (index === 2) {
            jQuery(element).click(function() {
                showSubMenu(licenseConflicts, "licenseConflicts");
            });
        }
    });

    return licensesMenu;
}

function buildBugzillaBugMenu(help) {
    var bugzillaBugsMenu = jQuery('\
<div data-pressgangtopic="24787" class="panel panel-default pressgangMenu">\
    <div class="panel-heading">' + help + 'Bugzilla Bugs</div>\
        <div id="bugzillaBugsPanel" class="panel-body ">\
            <ul id="bugzillaBugsItems" class="nav nav-pills nav-stacked">\
                <li><a>&lt;- Main Menu</a></li>\
                <li><a id="bugzillaBugsBugzillaBugsPlaceholder" class="alert-badge"  href="/PressZilla.user.js">This menu requires the PressZilla GreaseMonkey Extension. Click here to install.</a></li>\
                <li><a id="newBugzillaBugs">New</a></li>\
                <li><a id="assignedBugzillaBugs" href="javascript:hideAllMenus(); assignedBugzillaBugs.show(); localStorage.setItem(\'lastMenu\', \'assignedBugzillaBugs\');">Assigned</a></li>\
                <li><a id="postBugzillaBugs" href="javascript:hideAllMenus(); postBugzillaBugs.show(); localStorage.setItem(\'lastMenu\', \'postBugzillaBugs\');">Post</a></li>\
                <li><a id="modifiedBugzillaBugs" href="javascript:hideAllMenus(); modifiedBugzillaBugs.show(); localStorage.setItem(\'lastMenu\', \'modifiedBugzillaBugs\');">Modified</a></li>\
                <li><a id="onqaBugzillaBugs" href="javascript:hideAllMenus(); onqaBugzillaBugs.show(); localStorage.setItem(\'lastMenu\', \'onqaBugzillaBugs\');">On QA</a></li>\
                <li><a id="verifiedBugzillaBugs" href="javascript:hideAllMenus(); verifiedBugzillaBugs.show(); localStorage.setItem(\'lastMenu\', \'verifiedBugzillaBugs\');">Verified</a></li>\
                <li><a id="releasePendingBugzillaBugs" href="javascript:hideAllMenus(); releasePendingBugzillaBugs.show(); localStorage.setItem(\'lastMenu\', \'releasePendingBugzillaBugs\');">Release Pending</a></li>\
                <li><a id="closedBugzillaBugs" href="javascript:hideAllMenus(); closedBugzillaBugs.show(); localStorage.setItem(\'lastMenu\', \'closedBugzillaBugs\');">Closed</a></li>\
            </ul>\
        </div>\
    </div>\
</div>');

    // Add the click handler
    bugzillaBugsMenu.find("#bugzillaBugsItems a").each(function(index, element) {
        if (index === 0) {
            jQuery(element).click(hideSubMenu);
        } else if (index === 2) {
            jQuery(element).click(function() {
                showSubMenu(newBugzillaBugs, "newBugzillaBugs");
            });
        }
    });

    return bugzillaBugsMenu;
}

/**
 * Builds the side bar. Each menu is a separate panel that is shown or hidden as the user navigates through.
 */
function buildMenu() {
    // A place to do off screen rendering, to work around a Rapael bug
    offscreenRendering = jQuery('<div id="offscreenRendering" style="position: absolute; left: -1000px; top: -1000px"></div>');
    jQuery(document.body).append(offscreenRendering);

    // the icon used to show the initil menu
    menuIcon = buildMenuIcon();
    jQuery(document.body).append(menuIcon);

    // this is the help icon available on each menu
    var help = '<span style="float: right; font-size: 16px;" class="glyphicon glyphicon-question-sign" onclick="javascript:pressgang_website_enable()"></span>';

    // each menu is a Bootstrap panel with vertically stacked nav pills.
    mainMenu = buildMainMenu(help);
    jQuery(document.body).append(mainMenu);
    sideMenus.push(mainMenu);

    badLinks = buildBadLinksMenu(help);
    jQuery(document.body).append(badLinks);
    sideMenus.push(badLinks);

    duplicatedTopics = buildGenericChildMenu(help, "Duplicated Topics", "duplicatedTopicsItems", null);
    jQuery(document.body).append(duplicatedTopics);
    sideMenus.push(duplicatedTopics);

    doubledWords = buildGenericChildMenu(help, "Doubled Words", "doubledWordsErrorsItems", null);
    jQuery(document.body).append(doubledWords);
    sideMenus.push(doubledWords);

    spellingErrors = buildSpellingErrorsMenu(help);
    jQuery(document.body).append(spellingErrors);
    sideMenus.push(spellingErrors);

    topReusedTopics = buildGenericChildMenu(help, "Top Reused Topics", "topReusedTopicsItems", null);
    jQuery(document.body).append(topReusedTopics);
    sideMenus.push(topReusedTopics);

    topicsUpdatedInOtherSpecs = buildGenericChildMenu(help, "Updated Topics", "topicsUpdatedInOtherSpecsItems", 24789);
    jQuery(document.body).append(topicsUpdatedInOtherSpecs);
    sideMenus.push(topicsUpdatedInOtherSpecs);

    topicsAddedSince = buildTopicsAddedSinceMenu(help);
    jQuery(document.body).append(topicsAddedSince);
    sideMenus.push(topicsAddedSince);

    topicsAddedSince1Day = buildGenericChildSubMenu(help, "Topics Added In 1 Day", "topicsAddedSince1DayItems", 24794, topicsAddedSince, "topicsAddedSince");
    jQuery(document.body).append(topicsAddedSince1Day);
    sideMenus.push(topicsAddedSince1Day);

    topicsAddedSince1Week = buildGenericChildSubMenu(help, "Topics Added In 1 Week", "topicsAddedSince1WeekItems", 24794, topicsAddedSince, "topicsAddedSince");
    jQuery(document.body).append(topicsAddedSince1Week);
    sideMenus.push(topicsAddedSince1Week);

    topicsAddedSince1Month = buildGenericChildSubMenu(help, "Topics Added In 1 Month", "topicsAddedSince1MonthItems", 24794, topicsAddedSince, "topicsAddedSince");
    jQuery(document.body).append(topicsAddedSince1Month);
    sideMenus.push(topicsAddedSince1Month);

    topicsAddedSince1Year = buildGenericChildSubMenu(help, "Topics Added In 1 Year", "topicsAddedSince1YearItems", 24794, topicsAddedSince, "topicsAddedSince");
    jQuery(document.body).append(topicsAddedSince1Year);
    sideMenus.push(topicsAddedSince1Year);

    topicsRemovedSince = buildTopicsRemovedSinceMenu(help);
    jQuery(document.body).append(topicsRemovedSince);
    sideMenus.push(topicsRemovedSince);

    topicsRemovedSince1Day = buildGenericChildSubMenu(help, "Topics Removed In 1 Day", "topicsAddedSince1DayItems", 24792, topicsRemovedSince, "topicsRemovedSince");
    jQuery(document.body).append(topicsRemovedSince1Day);
    sideMenus.push(topicsRemovedSince1Day);

    topicsRemovedSince1Week = buildGenericChildSubMenu(help, "Topics Removed In 1 Week", "topicsAddedSince1WeekItems", 24792, topicsRemovedSince, "topicsRemovedSince");
    jQuery(document.body).append(topicsRemovedSince1Week);
    sideMenus.push(topicsRemovedSince1Week);

    topicsRemovedSince1Month = buildGenericChildSubMenu(help, "Topics Removed In 1 Month", "topicsAddedSince1MonthItems", 24792, topicsRemovedSince, "topicsRemovedSince");
    jQuery(document.body).append(topicsRemovedSince1Month);
    sideMenus.push(topicsRemovedSince1Month);

    topicsRemovedSince1Year = buildGenericChildSubMenu(help, "Topics Removed In 1 Year", "topicsAddedSince1YearItems", 24792, topicsRemovedSince, "topicsRemovedSince");
    jQuery(document.body).append(topicsRemovedSince1Year);
    sideMenus.push(topicsRemovedSince1Year);

    topicsByLastEdit = buildTopicsLastEditMenu(help);
    jQuery(document.body).append(topicsByLastEdit);
    sideMenus.push(topicsByLastEdit);

    topicsEditedIn1Day = buildGenericChildSubMenu(help, "Topics Edited In 1 Day", "topicsEditedIn1DayItems", 24793, "Topics By Last Edit", "topicsByLastEdit");
    jQuery(document.body).append(topicsEditedIn1Day);
    sideMenus.push(topicsEditedIn1Day);

    topicsEditedIn1Week = buildGenericChildSubMenu(help, "Topics Edited In 1 Week", "topicsEditedIn1WeekItems", 24793, "Topics By Last Edit", "topicsByLastEdit");
    jQuery(document.body).append(topicsEditedIn1Week);
    sideMenus.push(topicsEditedIn1Week);

    topicsEditedIn1Month = buildGenericChildSubMenu(help, "Topics Edited In 1 Month", "topicsEditedIn1MonthItems", 24793, "Topics By Last Edit", "topicsByLastEdit");
    jQuery(document.body).append(topicsEditedIn1Month);
    sideMenus.push(topicsEditedIn1Month);

    topicsEditedIn1Year = buildGenericChildSubMenu(help, "Topics Edited In 1 Year", "topicsEditedIn1YearItems", 24793, "Topics By Last Edit", "topicsByLastEdit");
    jQuery(document.body).append(topicsEditedIn1Year);
    sideMenus.push(topicsEditedIn1Year);


    topicsEditedInOlderThanYear = buildGenericChildSubMenu(help, "Topics Edited Prior To 1 Year", "topicsEditedInOlderThanYearItems", 24793, "Topics By Last Edit", "topicsByLastEdit");
    jQuery(document.body).append(topicsEditedInOlderThanYear);
    sideMenus.push(topicsEditedInOlderThanYear);

    licenses = buildLicensesMenu(help);
    jQuery(document.body).append(licenses);
    sideMenus.push(licenses);

    licensesPresent = buildGenericChildSubMenu(help, "Licenses Present", "licensesPresentItems", 24800, "Licenses", licenses, "licenses");
    jQuery(document.body).append(licensesPresent);
    sideMenus.push(licensesPresent);

    licenseConflicts = buildGenericChildSubMenu(help, "Licenses Conflicts", "licenseConflictsItems", 24800, "Licenses", licenses, "licenses");
    jQuery(document.body).append(licenseConflicts);
    sideMenus.push(licenseConflicts);

    bugzillaBugs = buildBugzillaBugsMenu(help);
    jQuery(document.body).append(bugzillaBugs);
    sideMenus.push(bugzillaBugs);

    hideAllMenus();

    // Show the initial menu, either from what was saved in local storage as being the last displayed menu,
    // or defaulting to the icon.
    var lastMenu = localStorage.getItem('lastMenu');
    if (lastMenu == 'mainMenu') {
        mainMenu.show();
        showMenu();
    } else if (lastMenu == 'topicsByLastEdit') {
        topicsByLastEdit.show();
        showMenu();
    } else if (lastMenu == 'topicsEditedIn1Day') {
        topicsEditedIn1Day.show();
        showMenu();
    } else if (lastMenu == 'topicsEditedIn1Week') {
        topicsEditedIn1Week.show();
        showMenu();
    } else if (lastMenu == 'topicsEditedIn1Month') {
        topicsEditedIn1Month.show();
        showMenu();
    } else if (lastMenu == 'topicsEditedIn1Year') {
        topicsEditedIn1Year.show();
        showMenu();
    } else if (lastMenu == 'topicsEditedInOlderThanYear') {
        topicsEditedInOlderThanYear.show();
        showMenu();
    } else if (lastMenu == "topicsAddedSince") {
        topicsAddedSince.show();
        showMenu();
    } else if (lastMenu == "topicsRemovedSince") {
        topicsRemovedSince.show();
        showMenu();
    } else if (lastMenu == "topicsAddedSince1Day") {
        topicsAddedSince1Year.show();
        showMenu();
    } else if (lastMenu == "topicsAddedSince1Week") {
        topicsAddedSince1Year.show();
        showMenu();
    } else if (lastMenu == "topicsAddedSince1Month") {
        topicsAddedSince1Year.show();
        showMenu();
    } else if (lastMenu == "topicsAddedSince1Year") {
        topicsAddedSince1Year.show();
        showMenu();
    } else if (lastMenu == "topicsRemovedSince1Day") {
        topicsRemovedSince1Day.show();
        showMenu();
    } else if (lastMenu == "topicsRemovedSince1Week") {
        topicsRemovedSince1Week.show();
        showMenu();
    } else if (lastMenu == "topicsRemovedSince1Month") {
        topicsRemovedSince1Month.show();
        showMenu();
    } else if (lastMenu == "topicsRemovedSince1Year") {
        topicsRemovedSince1Year.show();
        showMenu();
    } else if (lastMenu == "licenses") {
        licenses.show();
        showMenu();
    } else if (lastMenu == "licensesPresent") {
        licensesPresent.show();
        showMenu();
    } else if (lastMenu == "licenseConflicts") {
        licenseConflicts.show();
        showMenu();
    } else if (lastMenu == "bugzillaBugs") {
        bugzillaBugs.show();
        showMenu();
    } else if (lastMenu == "newBugzillaBugs") {
        newBugzillaBugs.show();
        showMenu();
    } else if (lastMenu == "assignedBugzillaBugs") {
        assignedBugzillaBugs.show();
        showMenu();
    } else if (lastMenu == "postBugzillaBugs") {
        postBugzillaBugs.show();
        showMenu();
    } else if (lastMenu == "modifiedBugzillaBugs") {
        modifiedBugzillaBugs.show();
        showMenu();
    } else if (lastMenu == "onqaBugzillaBugs") {
        onqaBugzillaBugs.show();
        showMenu();
    } else if (lastMenu == "verifiedBugzillaBugs") {
        verifiedBugzillaBugs.show();
        showMenu();
    } else if (lastMenu == "closedBugzillaBugs") {
        closedBugzillaBugs.show();
        showMenu();
    } else if (lastMenu == "releasePendingBugzillaBugs") {
        releasePendingBugzillaBugs.show();
        showMenu();
    } else if (lastMenu == "topicsUpdatedInOtherSpecs") {
        topicsUpdatedInOtherSpecs.show();
        showMenu();
    } else if (lastMenu == "topReusedTopics") {
        topReusedTopics.show();
        showMenu();
    } else if (lastMenu == "spellingErrors") {
        spellingErrors.show();
        showMenu();
    } else if (lastMenu == "doubledWords") {
        doubledWords.show();
        showMenu();
    } else if (lastMenu == "duplicatedTopics") {
        duplicatedTopics.show();
        showMenu();
    } else if (lastMenu == "badLinks") {
        badLinks.show();
        showMenu();
    } else {
        menuIcon.show();
        hideMenu();
    }

    var evt = document.createEvent( 'Event');
    evt.initEvent('menu_created', false, false);
    eventDetails =  {source: 'docbuilder'};
    window.dispatchEvent (evt);
}

/**
 * A utility function to count the number of keys in a dictionary
 * @param obj The object that is the dictionary
 * @returns {number} The number of keys it has.
 */
function countKeys(obj) {
    var size = 0, key;
    for (key in obj) {
        if (obj.hasOwnProperty(key)) size++;
    }
    return size;
};

function checkSpellingErrors(topic, condition, callback) {
    if (topic) {
        topicsToCheckForSpelling.push({topic: topic, condition: condition});
    }

    // it is possible we are trying to spell check topics before the dictionary is loaded.
    // in this case we just append to topicsToCheckForSpelling and grab them next time.
    if (dictionary != null) {

        var thisTopicsToCheckForSpelling = topicsToCheckForSpelling;
        topicsToCheckForSpelling = [];

        asyncJs.eachSeries(
            thisTopicsToCheckForSpelling,
            function(thisTopic, callback) {

                function preProcessXML(callback) {
                    // find any injection comments and replace them with a literal. These will be removed
                    // before spellchecking, and set to text that is skipped for double word checking.
                    // but having the comment replaced means that there is a break in a double word.
                    var fixedXML = thisTopic.topic.xml.replace(/<\!--\s*Inject\s*:.*?-->/g, "<literal></literal>");

                    /*
                     A number of docbook elements define a logical break between words that is lost
                     when the elements are removed. So we just add a literal after these to prevent
                     the double word logic from picking them up. Also, because we ignore literals
                     in the spell checking, these new elements have no impact.
                     */
                    var addDoubleWordBreaks = [
                        "title",
                        "entry",
                        "indexterm",
                        "primary",
                        "secondary",
                        "guimenu",
                        "guimenuitem",
                        "listitem",
                        "ulink",
                        "firstname",
                        "surname",
                        "revnumber"
                    ];

                    for (var elementIndex = 0, elementCount = addDoubleWordBreaks.length; elementIndex < elementCount; ++elementIndex) {
                        fixedXML = fixedXML.replace(new RegExp("<\/" + addDoubleWordBreaks[elementIndex] + ">", "g"), "</" + addDoubleWordBreaks[elementIndex] + "><literal></literal>");
                    }

                    fixedXML = fixedXML.replace(/&.*?;/g, " ");

                    callback(null, fixedXML);
                }

                function convertXml(xml, callback) {
                    try {
                        callback(null, jQuery(jQuery.parseXML(xml)));
                    } catch (e) {
                        callback(e);
                    }
                }

                function stripConditionalElements(xmlDoc, callback) {

                    var specCondition = new RegExp(thisTopic.condition);

                    function testNode(node, callback) {

                        function testChildren() {
                            asyncJs.eachSeries(
                                node.children(),
                                function (childNode, eachCallback) {
                                    testNode(jQuery(childNode), function () {
                                        eachCallback();
                                    });
                                }, function (err) {
                                    callback();
                                }
                            );
                        }

                        if (node.attr("condition")) {
                            var nodeConditionAttribute = node.attr("condition");
                            var nodeConditions = nodeConditionAttribute.split(/;|:|,/);

                            var include = false;
                            for (var conditionIndex = 0, conditionCount = nodeConditions.length; conditionIndex < conditionCount; ++conditionIndex) {
                                var nodeCondition = nodeConditions[conditionIndex];
                                if (specCondition.test(nodeCondition)) {
                                    include = true;
                                    break;
                                }
                            }

                            if (!include) {
                                node.remove();
                                callback();
                            } else {
                                testChildren();
                            }
                        } else {
                            testChildren();
                        }
                    }

                    testNode(xmlDoc, function() {callback(null, xmlDoc)});
                }

                function checkSpelling(xmlDoc, callback) {
                    // These docbook elements will commonly contain words that are not found in the dictionary.
                    var doNotSpellCheck = [
                        "parameter",
                        "screen",
                        "programlisting",
                        "command",
                        "literal",
                        "package",
                        "systemitem",
                        "application",
                        "guibutton",
                        "guilabel",
                        "filename",
                        "replaceable",
                        "code",
                        "option",
                        "classname",
                        "interfacename",
                        "synopsis",
                        "classsynopsis",
                        "classsynopsisinfo",
                        "constructorsynopsis",
                        "destructorsynopsis",
                        "methodsynopsis",
                        "fieldsynopsis",
                        "cmdsynopsis",
                        "funcsynopsis",
                        "methodname",
                        "exceptionname",
                        "term",
                        "uri",
                        "keycap",
                        "keysym",
                        "symbol"
                    ];

                    // remove the contents of these elements
                    for (var elementIndex = 0, elementCount = doNotSpellCheck.length; elementIndex < elementCount; ++elementIndex) {
                        jQuery(doNotSpellCheck[elementIndex], xmlDoc).text(" | ");
                    }

                    // We split the string up now to look for doubled words
                    var doubledWords = xmlDoc.text().split(/\s+/);

                    var text = xmlDoc.text();

                    // remove all xml/html entities
                    var entityRe = /&.*?;/;
                    var entityMatch = null;
                    while ((entityMatch = text.match(entityRe)) != null) {
                        var entityLength = entityMatch[0].length;
                        var replacementString = "";
                        for (var i = 0; i < entityLength; ++i) {
                            replacementString += " ";
                        }
                        text = text.replace(entityRe, replacementString);
                    }

                    // remove all urls
                    var urlRe = /\b((?:https?:\/\/|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?Â«Â»â€œâ€â€˜â€™]))/i;
                    var urlMatch = null;
                    while ((urlMatch = text.match(urlRe)) != null) {
                        var urlLength = urlMatch[0].length;
                        var replacementString = "";
                        for (var i = 0; i < urlLength; ++i) {
                            replacementString += " ";
                        }
                        text = text.replace(urlRe, replacementString);
                    }

                    // replace any character that doesn't make up a word with a space, and then split on space
                    text = text.replace(/[^a-zA-Z0-9'\\-]/g, ' ');

                    // remove all stand alone characters
                    var dashRe = /\s+[^\sA-Za-z0-9]\s+/;
                    var dashMatch = null;
                    while ((dashMatch = text.match(dashRe)) != null) {
                        var dashLength = dashMatch[0].length;
                        var replacementString = "";
                        for (var i = 0; i < dashLength; ++i) {
                            replacementString += " ";
                        }
                        text = text.replace(dashRe, replacementString);
                    }

                    // remove anything that does not contain a letter
                    var numberRe = /\b[^A-Za-z\s]+\b/;
                    var numberMatch = null;
                    while ((numberMatch = text.match(numberRe)) != null) {
                        var numberLength = numberMatch[0].length;
                        var replacementString = "";
                        for (var i = 0; i < numberLength; ++i) {
                            replacementString += " ";
                        }
                        text = text.replace(numberRe, replacementString);
                    }

                    // remove the quotes around words
                    var quoteRe = /'(.*?)'/;
                    var quoteMatch = null;
                    while ((quoteMatch = text.match(quoteRe)) != null) {
                        var numberLength = quoteMatch[0].length;
                        var replacementString = " " + quoteMatch[1] + " ";
                        text = text.replace(quoteRe, replacementString);
                    }

                    var words = text.split(/\s+/);

                    for (var wordIndex = 0; wordIndex < words.length; ++wordIndex) {
                        var word = words[wordIndex];
                        if (!dictionary.check(word)) {

                            ++spellingErrorsCount;

                            if (!buttons[word]) {

                                var wordId = "spellingError" + word.replace(/[^A-Za-z0-9]/g, "");

                                var buttonParent = jQuery('<div class="btn-group" style="margin-bottom: 8px;"></div>');
                                var button = jQuery('<button id="' + wordId + '" type="button" class="btn btn-default" style="width:230px; white-space: normal;">' + word + '</button>\
                         <button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" style="position: absolute; top:0; bottom: 0">\
                             <span class="caret"></span>\
                         </button>');
                                var buttonList = jQuery('<ul class="dropdown-menu" role="menu"></ul>');
                                if (window.bootbox) {
                                    var addToDictionary = jQuery("<li><a>Add to dictionary</a></li>");
                                    addToDictionary.click(function() {
                                        addToDictionary(true, word, wordId);
                                    });
                                    buttonList.append(addToDictionary);
                                }
                                jQuery(button).appendTo(buttonParent);
                                jQuery(buttonList).appendTo(buttonParent);
                                jQuery(buttonParent).appendTo(jQuery("#spellingErrorsItems"));

                                buttons[word] = {list: buttonList, topics: []};
                            }

                            if (jQuery.inArray(thisTopic.topic.id, buttons[word].topics) == -1) {
                                buttons[word].topics.push(thisTopic.topic.id);
                                var link = jQuery('<li><a>' + thisTopic.topic.id + '</a></li>');
                                link.click(function() {
                                    topicSections[thisTopic.topic.id].scrollIntoView();
                                });
                                link.appendTo(buttons[word].list);
                            }
                        }
                    }

                    for (var doubleWordIndex = 0; doubleWordIndex < doubledWords.length - 1; ++doubleWordIndex) {
                        var word = doubledWords[doubleWordIndex];
                        var nextWord = doubledWords[doubleWordIndex + 1];

                        if (word.match(/^[^A-Za-z]*$/) == null &&
                            word === nextWord) {

                            ++doubleWordErrors;

                            if (!doubleWordButtons[word]) {
                                var buttonParent = jQuery('<div class="btn-group" style="margin-bottom: 8px;"></div>');
                                var button = jQuery('<button type="button" class="btn btn-default" style="width:230px; white-space: normal;">' + word + '</button>\
                                 <button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" style="position: absolute; top:0; bottom: 0">\
                                     <span class="caret"></span>\
                                 </button>');
                                var buttonList = jQuery('<ul class="dropdown-menu" role="menu"></ul>');
                                jQuery(button).appendTo(buttonParent);
                                jQuery(buttonList).appendTo(buttonParent);
                                jQuery(buttonParent).appendTo(jQuery("#doubledWordsErrorsItems"));

                                doubleWordButtons[word] = {list: buttonList, topics: []};
                            }

                            if (jQuery.inArray(thisTopic.topic.id, doubleWordButtons[word].topics) == -1) {
                                doubleWordButtons[word].topics.push(thisTopic.topic.id);
                                var link = jQuery('<li><a>' + thisTopic.topic.id + '</a></li>');
                                link.click(function() {
                                    topicSections[thisTopic.topic.id].scrollIntoView();
                                });
                                link.appendTo(doubleWordButtons[word].list);
                            }
                        }
                    }

                    callback(null);
                }

                asyncJs.waterfall(
                    [
                        preProcessXML,
                        convertXml,
                        stripConditionalElements,
                        checkSpelling
                    ],
                    function (err, result) {
                        callback();
                    }
                )
            },
            function(err) {
                if (callback) {
                    callback();
                }
            }
        )
    } else {
        if (callback) {
            callback();
        }
    }
}

/**
 * The side menus require various information about topics and specs. This function is where
 * we pull down this information.
 *
 * Since browsers limit the number of connections to a server, even between tabs, we want to
 * avoid queuing up too many requests.
 */
function getInfoFromREST(callback) {

    // first we need to know all the topics in the spec, and what revision (if any) is used.
    var specId = getSpecIdFromURL();
    if (specId) {
        var topicsUrl = REST_SERVER + "1/contentspecnodes/get/json/query;csNodeType=0,9,10;contentSpecIds=" + specId + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22nodes%22%7D%2C%20%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22inheritedCondition%22%7D%7D%5D%7D%5D%7D";
        jQuery.getJSON(topicsUrl, function(topicNodes) {
            callback(null, specId, topicNodes);
        });
    }
}

/**
 * Once all the information from the latest versions of the topics is found, we go through and
 * get the details on the topic revisions
 */
function getRevisionInfoFromREST(specId, topicNodes, callback) {

    var index = 0;

    asyncJs.eachSeries(
        topicNodes.items,
        function(topicNodeContainer, callback){
            jQuery("#spellingErrorsBadge").remove();
            jQuery("#doubledWordsErrorsBadge").remove();
            jQuery('#spellingErrors').append(jQuery('<span id="spellingErrorsBadge" class="badge pull-right">' + spellingErrorsCount + ' (Step 1 ' + (index /  topicNodes.items.length * 100).toFixed(2) + '%)</span>'));
            jQuery('#doubledWordsErrors').append(jQuery('<span id="doubledWordsErrorsBadge" class="badge pull-right">' + doubleWordErrors + ' (Step 1 ' + (index /  topicNodes.items.length * 100).toFixed(2) + '%)</span>'));

            ++index;

            var topicNode = topicNodeContainer.item;
            var topicID = topicNode.entityId;
            var topicRevision = topicNode.entityRevision;

            if (topicRevision) {
                var topicRevisionUrl = REST_SERVER + "1/topic/get/json/" + topicID + "/r/" + topicRevision;
                jQuery.getJSON(topicRevisionUrl, function(data) {
                    checkSpellingErrors(data, topicNode.inheritedCondition, function() {
                        callback();
                    });
                });
            } else {
                callback();
            }
        },
        function(err) {
            jQuery("#spellingErrorsBadge").remove();
            jQuery("#doubledWordsErrorsBadge").remove();
            jQuery('#spellingErrors').append(jQuery('<span id="spellingErrorsBadge" class="badge pull-right">' + spellingErrorsCount + ' (Pass 2 0%)</span>'));
            jQuery('#doubledWordsErrors').append(jQuery('<span id="doubledWordsErrorsBadge" class="badge pull-right">' + doubleWordErrors + ' (Pass 2 0%)</span>'));

            callback(null, specId, topicNodes);
        }
    );
}

function getTopicDetailsInBatches(specId, topicNodes, callback) {

    function getTopicDetailsInBatchesInternal(index) {
        if (index < topicNodes.items.length) {

            // the list of topic ids to send tp the query url
            var topicIdList = "";

            for (var topicIndex = index; topicIndex < index + TOPIC_BATCH_SIZE && topicIndex < topicNodes.items.length; ++topicIndex) {
                var topicNode = topicNodes.items[topicIndex].item;

                if (topicIdList.length != 0) {
                    topicIdList += ",";
                }
                topicIdList += topicNode.entityId;
            }

            // for each topic we need the latest revision, and the specific revision included in the spec (if the revision is defined)
            var topicUrl = BACKGROUND_QUERY_PREFIX + topicIdList + BACKGROUND_QUERY_POSTFIX;
            jQuery.getJSON(topicUrl, function(expandedTopics) {

                asyncJs.eachSeries(
                    expandedTopics.items,
                    function(topicContainer, callback) {
                        var topic = topicContainer.item;

                        function saveLatestRevision(callback) {
                            if (!topicLatestRevisions[topic.id]) {
                                topicLatestRevisions[topic.id] = topic.revision;
                            }

                            callback(null);
                        }

                        function saveTopicTitle(callback) {
                            if (!topicNames[topic.id]) {
                                topicNames[topic.id] = topic.title;
                            }

                            callback(null);
                        }

                        function saveDescription(callback) {
                            if (descriptionCache[topic.id]) {
                                descriptionCache[topic.id].data = topic.description && topic.description.trim().length != 0 ? topic.description : "[No Description]";
                            }

                            callback(null);
                        }

                        function saveRevisions(callback) {
                            if (historyCache[topic.id]) {
                                historyCache[topic.id].data = [];
                                for (var revisionIndex = 0, revisionCount = topic.revisions.items.length; revisionIndex < revisionCount; ++revisionIndex) {
                                    var revision = topic.revisions.items[revisionIndex].item;
                                    historyCache[topic.id].data.push({
                                        revision: revision.revision,
                                        message: revision.logDetails.message,
                                        lastModified: revision.lastModified});
                                }

                                updateCount(topic.id + "historyIcon", historyCache[topic.id].data.length);
                                updateHistoryIcon(topic.id, topic.title);


                            }

                            callback(null);
                        }

                        function saveTags(callback) {
                            if (tagsCache[topic.id]) {
                                tagsCache[topic.id].data = [];
                                for (var tagIndex = 0, tagCount = topic.tags.items.length; tagIndex < tagCount; ++tagIndex) {
                                    var tag = topic.tags.items[tagIndex].item;
                                    tagsCache[topic.id].data.push({
                                        name: tag.name,
                                        id: tag.id
                                    });
                                }

                                updateCount(topic.id + "tagsIcon", tagsCache[topic.id].data.length);
                            }

                            callback(null);
                        }

                        function saveURLs(callback) {
                            if (urlCache[topic.id]) {
                                urlCache[topic.id].data = [];

                                var match = null;
                                while (match = COMMENT_RE.exec(topic.xml)) {
                                    var comment = match[1];

                                    var match2 = null;
                                    while (match2 = URL_RE.exec(comment)) {
                                        var url = match2[0];
                                        urlCache[topic.id].data.push({url: url, title: "[Comment] " + url});
                                    }
                                }

                                for (var urlsIndex = 0, urlsCount = topic.sourceUrls_OTM.items.length; urlsIndex < urlsCount; ++urlsIndex) {
                                    var url = topic.sourceUrls_OTM.items[urlsIndex].item;
                                    urlCache[topic.id].data.push({url: url.url, title: url.title == null || url.title.length == 0 ? url.url : url.title});
                                }

                                updateCount(topic.id + "urlsIcon", urlCache[topic.id].data.length);
                            }

                            callback(null);
                        }

                        function saveSpecs(callback) {
                            if (specCache[topic.id]) {
                                specCache[topic.id].data = [];
                                var specs = {};
                                for (var specIndex = 0, specCount = topic.contentSpecs_OTM.items.length; specIndex < specCount; ++specIndex) {
                                    var spec = topic.contentSpecs_OTM.items[specIndex].item;
                                    if (!specs[spec.id]) {
                                        var specDetails = {id: spec.id, title: "", product: "", version: ""};
                                        for (var specChildrenIndex = 0, specChildrenCount = spec.children_OTM.items.length; specChildrenIndex < specChildrenCount; ++specChildrenIndex) {
                                            var child = spec.children_OTM.items[specChildrenIndex].item;
                                            if (child.title == "Product") {
                                                specDetails.product = child.additionalText;
                                            } else if (child.title == "Version") {
                                                specDetails.version = child.additionalText;
                                            }
                                            if (child.title == "Title") {
                                                specDetails.title = child.additionalText;
                                            }
                                        }
                                        specs[spec.id] = specDetails;
                                    }
                                }

                                for (spec in specs) {
                                    specCache[topic.id].data.push(specs[spec]);
                                }

                                updateCount(topic.id + "bookIcon", specCache[topic.id].data.length);
                            }

                            callback(null);
                        }


                        function checkSpelling(callback) {

                            asyncJs.detectSeries(
                                topicNodes.items,
                                function(topicNode, callback) {
                                    callback(topicNode.item.entityId === topic.id);
                                },
                                function(result) {
                                    if (result !== undefined && !result.item.entityRevision) {
                                        checkSpellingErrors(topic, result.item.inheritedCondition, function() {callback(null)});
                                    } else {
                                        callback(null);
                                    }
                                }
                            );
                        }

                        asyncJs.waterfall([
                            saveLatestRevision,
                            saveTopicTitle,
                            saveDescription,
                            saveRevisions,
                            saveTags,
                            saveURLs,
                            saveSpecs,
                            checkSpelling
                        ],
                            function (err) {
                                jQuery("#spellingErrorsBadge").remove();
                                jQuery("#doubledWordsErrorsBadge").remove();
                                jQuery('#spellingErrors').append(jQuery('<span id="spellingErrorsBadge" class="badge pull-right">' + spellingErrorsCount + ' (Pass 2 ' + (index / topicNodes.items.length * 100).toFixed(2) + '%)</span>'));
                                jQuery('#doubledWordsErrors').append(jQuery('<span id="doubledWordsErrorsBadge" class="badge pull-right">' + doubleWordErrors + ' (Pass 2 ' + (index / topicNodes.items.length * 100).toFixed(2) + '%)</span>'));

                                callback();
                            }
                        );
                    },
                    function(err) {
                        getTopicDetailsInBatchesInternal(index + TOPIC_BATCH_SIZE);
                    }
                );
            });
        } else {
            console.log("Retrieved all topic data");

            jQuery("#spellingErrorsBadge").remove();
            jQuery("#doubledWordsErrorsBadge").remove();
            jQuery('#spellingErrors').append(jQuery('<span id="spellingErrorsBadge" class="badge pull-right">' + spellingErrorsCount + '</span>'));
            jQuery('#doubledWordsErrors').append(jQuery('<span id="doubledWordsErrorsBadge" class="badge pull-right">' + doubleWordErrors + '</span>'));

            buildTopicEditedInChart();

            callback(null, specId, topicNodes);
        }
    }

    getTopicDetailsInBatchesInternal(0);
}

function getDuplicatedTopics(specId, topicNodes, callback) {

    var index = 0;

    asyncJs.eachSeries(
        topicNodes.items,
        function(topicNodeContainer, callback) {
            jQuery("#duplicatedTopicsBadge").remove();
            jQuery('#duplicatedTopics').append(jQuery('<span id="duplicatedTopicsBadge" class="badge pull-right">' + duplicatedTopicsCount + " (" +(index / topicNodes.items.length * 100.0).toFixed(2) + '%)</span>'));

            ++index;

            var topicNode = topicNodeContainer.item;
            var topicID = topicNode.entityId;
            var similarTopicsUrl = REST_SERVER + "1/topics/get/json/query;minHash=" + topicID + "%3A0.6?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%22topics%22%7D%5D%7D";
            jQuery.getJSON(similarTopicsUrl, function(data){

                if (dupTopicsCache[topicID]) {
                    dupTopicsCache[topicID].data = [];

                    data.items.sort(function(a, b){
                        if (a.item.revision < b.item.revision) {
                            return 1;
                        }
                        if (a.item.revision == b.item.revision) {
                            return 0;
                        }
                        return -1;
                    });

                    for (var topicIndex = 0, topicCount = data.items.length; topicIndex < topicCount; ++topicIndex) {
                        dupTopicsCache[topicID].data.push(data.items[topicIndex].item);
                    }

                    /*
                     Add the menu items
                     */
                    var myDuplicatedTopicCount = dupTopicsCache[topicID].data.length;

                    if (myDuplicatedTopicCount != 0) {
                        ++duplicatedTopicsCount;
                        var buttonParent = jQuery('<div class="btn-group" style="margin-bottom: 8px;"></div>');
                        var button = jQuery('<button type="button" class="btn btn-default" style="width:230px; white-space: normal;">Topic: ' + topicID + '</button>');
                        button.click(function() {
                            topicSections[topicID].scrollIntoView();
                        });
                        button.appendTo(buttonParent);
                        buttonParent.appendTo(jQuery("#duplicatedTopicsItems"));
                    }

                    updateCount(topicID + "duplicateIcon", dupTopicsCache[topicID].data.length);
                }
                callback();
            });
        },
        function(err) {
            jQuery("#duplicatedTopicsBadge").remove();
            jQuery('#duplicatedTopics').append(jQuery('<span id="duplicatedTopicsBadge" class="badge pull-right">' + duplicatedTopicsCount + '</span>'));
            callback(null, specId, topicNodes);
        }
    );


}

function getDictionary() {
    var customDicUrl = REST_SERVER + "1/topics/get/json/query;propertyTagExists" + VALID_WORD_EXTENDED_PROPERTY_TAG_ID + "=true;propertyTagExists" + INVALID_WORD_EXTENDED_PROPERTY_TAG_ID + "=true;propertyTagExists" + DISCOURAGED_WORD_EXTENDED_PROPERTY_TAG_ID + "=true;propertyTagExists" + DISCOURAGED_PHRASE_EXTENDED_PROPERTY_TAG_ID + "=true;logic=Or?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%22topics%22%2C%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A+%22properties%22%7D%7D%5D%7D%5D%7D";
    jQuery.getJSON(customDicUrl, function(topics) {
        var customWords = "";
        var customWordsDict = {};

        for (var topicIndex = 0, topicCount = topics.items.length; topicIndex < topicCount; ++topicIndex) {
            var topic =  topics.items[topicIndex].item;

            for (var propertyIndex = 0, propertyCount = topic.properties.items.length; propertyIndex < propertyCount; ++propertyIndex) {
                var property = topic.properties.items[propertyIndex].item;

                if (property.id == VALID_WORD_EXTENDED_PROPERTY_TAG_ID ||
                    INVALID_WORD_EXTENDED_PROPERTY_TAG_ID ||
                    DISCOURAGED_WORD_EXTENDED_PROPERTY_TAG_ID ||
                    DISCOURAGED_PHRASE_EXTENDED_PROPERTY_TAG_ID) {
                    if (!customWordsDict[property.value]) {
                        customWordsDict[property.value] = {tagId: property.id, id: topic.id};

                        if (customWords.length != 0) {
                            customWords += "\n";
                        }

                        customWords += property.value;
                    }
                }
            }
        }

        addDictionaryPopovers(customWordsDict);

        jQuery.get("/lib/typo/dictionaries/en_US.aff", function(affData) {
            jQuery.get("/lib/typo/dictionaries/en_US.dic", function(dicData) {

                dictionary = new Typo("en_US", affData, dicData + "\n" + customWords);

                if (topicsToCheckForSpelling.length != 0) {
                    /*
                     Kick off the spell checking process if we were waiting on the dictionaries to
                     be loaded.
                     */
                    checkSpellingErrors();
                }
            })
        });
    });
}

/**
 * Scan the text in the page for any words that match those in the custom dictionary, and add a popover icon.
 */
function addDictionaryPopovers(customWordsDict) {

    // create an array that sorts the keys in the customWordsDict by length
    var customWordsKeyset = [];
    for (var customWord in customWordsDict) {
        customWordsKeyset.push(customWord);
    }

    customWordsKeyset.sort(function(a, b){
        if (a.length > b.length) {
            return -1;
        }

        if (a.length == b.length) {
            return 0;
        }

        return 1;
    });

    function collectTextNodes(element, texts) {
        var classes = element.hasAttribute("class") ? element.getAttribute("class").split(/\s+/) : {};
        if (jQuery.inArray(element.nodeName, SKIP_ELEMENTS) == -1 && jQuery.inArray("pressgangMenu", classes) == -1) {
            for (var child= element.firstChild; child!==null; child= child.nextSibling) {
                if (child.nodeType===3) {
                    // Ignore text nodes that are just whitespace or new lines
                    if (!whitespaceRE.test(child.nodeValue))
                        texts.push(child);
                } else if (child.nodeType===1) {
                    collectTextNodes(child, texts);
                }
            }
        }
    }

    var texts = [];
    collectTextNodes(document.body, texts);

    var batchsize = 20;

    function processTextNodes(texts, index) {
        if (index < texts.length) {
            for (var textIndex = index, textCount = texts.length; textIndex < textCount && textIndex < index + batchsize; ++textIndex) {
                var textNode = texts[textIndex];
                var initialText = encodeXml(jQuery(textNode).text());
                var fixedText = initialText;

                // mark up the dictionary matches
                for (var customWordIndex = 0, customWordCount = customWordsKeyset.length; customWordIndex < customWordCount; ++customWordIndex) {
                    // Check to see if the custom word is in the text
                    var customWord = customWordsKeyset[customWordIndex];
                    if (fixedText.indexOf(customWord) == -1) continue;

                    var replacementMarkers = {};

                    // Go through and replace all previously matches text with markers
                    var spanRE = /\<span.*?\<\/span\>/;
                    var spanMatch = null;
                    while ((spanMatch = fixedText.match(spanRE)) != null) {
                        var replacementString = "[" + (Math.random() * 1000) + "]";

                        while (fixedText.indexOf(replacementString) != -1) {
                            replacementString = "[" + (Math.random() * 1000) + "]";
                        }

                        fixedText = fixedText.replace(spanRE, replacementString);
                        replacementMarkers[replacementString] = spanMatch[0];
                    }

                    var customWordDetails = customWordsDict[customWord];
                    var borderStyle = "";
                    if (customWordDetails.tagId == VALID_WORD_EXTENDED_PROPERTY_TAG_ID) {
                        borderStyle = "border-color: green";
                    } else if (customWordDetails.tagId == INVALID_WORD_EXTENDED_PROPERTY_TAG_ID) {
                        borderStyle = "border-color: red";
                    } else if (customWordDetails.tagId == DISCOURAGED_WORD_EXTENDED_PROPERTY_TAG_ID) {
                        borderStyle = "border-color: purple";
                    } else if (customWordDetails.tagId == DISCOURAGED_PHRASE_EXTENDED_PROPERTY_TAG_ID) {
                        borderStyle = "border-color: purple";
                    }
                    fixedText = fixedText.replace(new RegExp("\\b" + encodeRegex(customWord) + "\\b", "g"), "<span style='text-decoration: none; border-bottom: 1px dashed; " + borderStyle + "' data-dictionary-id='" + customWordDetails.id + "'>" + customWord + "</span>");

                    // replace the markers with the original text
                    for (var replacement in replacementMarkers) {
                        fixedText = fixedText.replace(replacement, replacementMarkers[replacement]);
                    }
                }

                // If the content has changed, ie a dictionary match was found, then update the text node
                if (initialText !== fixedText) {
                    var fixedTextEle = jQuery("<span>" + fixedText + "</span>");
                    fixedTextEle.find("span").each(function(index, element) {
                        var jqueryEle = jQuery(element);
                        var id = jqueryEle.attr("data-dictionary-id");
                        if (id) {
                            jqueryEle.click(function(e) {
                                displayDictionaryTopic(id);
                            });
                        };
                    });
                    jQuery(textNode).replaceWith(fixedTextEle);
                }
            }

            setTimeout(function() {
                processTextNodes(texts, index + batchsize);
            }, 0);

        }
    }

    processTextNodes(texts, 0);
}

function displayDictionaryTopic(topicId) {
    bootbox.alert("<div id='dictionaryTopicViewPlaceholder'>Loading dictionary topic...</div>");

    var topicDetailsUrl = REST_SERVER + "1/topic/get/json/" + topicId;
    jQuery.getJSON(topicDetailsUrl, function(topic){
        var holdXMLUrl = REST_SERVER + "1/holdxml";
        jQuery.ajax({
            type: "POST",
            contentType: "application/xml",
            url: holdXMLUrl,
            data: "<?xml-stylesheet type='text/xsl' href='" + STATIC_URL + "publican-docbook/html-single-renderonly.xsl'?>" + topic.xml,
            success: function(holdId) {
                jQuery('#dictionaryTopicViewPlaceholder').replaceWith(jQuery("<iframe width='100%' height='300px' frameborder='0' src='" + REST_SERVER + "1/echoxml?id=" + holdId.value + "'></iframe><a href='" + UI_URL + "#SearchResultsAndTopicView;query;topicIds=" + topicId + "'>Edit this topic</a>"));
            },
            dataType: "json"
        });
    });
}

function addCustomWord(id) {
    bootbox.prompt("Please enter the word to be added to the dictionary.", function(result) {
        if (result !== null && jQuery.trim(result).length != 0) {
            addToDictionary(id, result);
        }
    });
}

function addToDictionary(id, word, wordId) {
    word = encodeXml(word);

    var existingTopicUrl = REST_SERVER + "1/topics/get/json/query;propertyTag" + id + "=" + encodeURIComponent(word) + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%22topics%22%7D%5D%7D";
    jQuery.getJSON(existingTopicUrl, function(topics){
        if (topics.items.length == 0) {
            bootbox.dialog({
                message: "<textarea id='newWordDetails' style='width: 100%; height: 300px'></textarea>",
                title: "Please enter a plain text description for '" + word + "'. This description will be displayed in the ECS custom dictionary.",
                buttons: {
                    danger: {
                        label: "Cancel",
                        className: "btn-default"
                    },
                    success: {
                        label: "OK",
                        className: "btn-primary",
                        callback: function() {
                            var description = jQuery.trim(jQuery('#newWordDetails').val());
                            if (description.length == 0) {
                                bootbox.alert("Please enter a description.", function() {
                                    addToDictionary(validWord, word, wordId);
                                });
                            } else {
                                var paras = description.split("\n");
                                var docbook = "<section><title>" + word + "</title>";

                                for (var parasIndex = 0, parasCount = paras.length; parasIndex < parasCount; ++parasIndex) {
                                    var trimmedPara = encodeXml(jQuery.trim(paras[parasIndex]));

                                    if (trimmedPara.length != 0) {
                                        docbook += "<para>" + trimmedPara + "</para>";
                                    }
                                }

                                docbook += "</section>";

                                var createTopicURL = REST_SERVER + "1/topic/create/json?message=docbuilder%3A+New+dictionary+word+added&flag=2&userId=89";
                                var postBody = '{"xml":"' + docbook.replace(/\\/g, "\\\\") + '", "locale":"en-US", "properties":{"items":[{"item":{"value":"' + word.replace(/\\/g, "\\\\") + '", "id":' + id + '}, "state":1}]}, "configuredParameters":["properties","locale","xml"]}';

                                jQuery.ajax({
                                    type: "POST",
                                    contentType: "application/json",
                                    url: createTopicURL,
                                    data: postBody,
                                    success: function(data) {
                                        if (wordId) {
                                            jQuery("#" + wordId).remove();
                                        }
                                        bootbox.alert("Topic <a href='" + UI_URL + "#SearchResultsAndTopicView;query;topicIds=" + data.id + "'>" + data.id + "</a> was successfully created to represent '" + word + "' in the custom dictionary.");
                                    },
                                    error: function() {
                                        bootbox.alert("An error occurred while trying to create the topic. Please try again later.");
                                    },
                                    dataType: "json"
                                });
                            }
                        }
                    }
                }
            });
        } else {
            bootbox.alert("This word has already been added. Please view <a href='http://docbuilder.ecs.eng.bne.redhat.com/22516/'>The ECS Custom Dictionary</a> to review the definition of the '" + word + "'");
        }
    });
}

/**
 * Encode any special XML characters
 * @param text t=The text to be encoded
 * @returns The encoded text
 */
function encodeXml(text) {
    text = text.replace(/&/g, "&amp;");
    text = text.replace(/'/g, "&apos;");
    text = text.replace(/"/g, "&quot;");
    text = text.replace(/</g, "&lt;");
    text = text.replace(/>/g, "&gt;");
    return text;
}

function encodeRegex(text) {
    text = text.replace(/\\/g, "\\\\");
    text = text.replace(/\./g, "\\.");
    text = text.replace(/\+/g, "\\+");
    text = text.replace(/\-/g, "\\-");
    text = text.replace(/\*/g, "\\*");
    text = text.replace(/\?/g, "\\?");
    text = text.replace(/\[/g, "\\[");
    text = text.replace(/\]/g, "\\]");
    text = text.replace(/\^/g, "\\^");
    text = text.replace(/\$/g, "\\$");
    text = text.replace(/\(/g, "\\(");
    text = text.replace(/\)/g, "\\)");
    text = text.replace(/\{/g, "\\{");
    text = text.replace(/\}/g, "\\}");
    text = text.replace(/\=/g, "\\=");
    text = text.replace(/\!/g, "\\!");
    text = text.replace(/\</g, "\\<");
    text = text.replace(/\>/g, "\\>");
    text = text.replace(/\|/g, "\\|");
    text = text.replace(/\:/g, "\\:");
    return text;
}

return {
    findTopicsInHtml: findTopicsInHtml,
    addPermLinks: addPermLinks,
    buildMenu: buildMenu,
    secondPass: secondPass,
    getSpecIdFromURL: getSpecIdFromURL
};

});