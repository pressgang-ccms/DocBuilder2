// ==UserScript==
// @name          Docbuilder Overlay
// @namespace     https://skynet.usersys.redhat.com
// @include       http://docbuilder.usersys.redhat.com/*
// @require       http://code.jquery.com/jquery-2.0.3.min.js
// @require       https://rawgithub.com/moment/moment/2.2.1/min/moment.min.js
// ==/UserScript==

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
 * The server hostname and port
 * @type {string}
 */
var BASE_SERVER =  "topika.ecs.eng.bne.redhat.com:8080";
/**
 * The server that hosts the UI we want to connect to.
 * @type {string}
 */
var SERVER = "http://" + BASE_SERVER + "/pressgang-ccms/rest/1";
//var SERVER = "http://skynet-dev.usersys.redhat.com:8080/pressgang-ccms/rest/1";
/**
 * The WebDAV server, without the protocol.
 * @type {string}
 */
var WEBDAV_SERVER = BASE_SERVER + "/pressgang-ccms/webdav"
/**
 * The start of the URL to the REST endpoint to call to get all the details for all the topics
 * @type {string}
 */
var BACKGROUND_QUERY_PREFIX = SERVER + "/topics/get/json/query;topicIds="
/**
 * The end of the URL to the REST endpoint to call to get all the details for all the topics
 * @type {string}
 */
var BACKGROUND_QUERY_POSTFIX = "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22topics%22%7D%2C%20%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22contentSpecs_OTM%22%7D%2C%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22children_OTM%22%7D%7D%5D%7D%2C%7B%22trunk%22%3A%7B%22name%22%3A%20%22sourceUrls_OTM%22%7D%7D%2C%7B%22trunk%22%3A%7B%22name%22%3A%20%22revisions%22%2C%20%22start%22%3A%200%2C%20%22end%22%3A%2015%7D%2C%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22logDetails%22%7D%7D%5D%7D%2C%7B%22trunk%22%3A%7B%22name%22%3A%20%22tags%22%7D%7D%5D%7D%5D%7D%0A%0A"

/**
 * How long to wait for the window to load before starting the second pass
 * @type {number}
 */
var SECOND_PASS_TIMEOUT = 30000;
/**
 * How long to wait beteen each call to get the data for the second pass
 * @type {number}
 */
var SECOND_PASS_REST_CALL_DELAY = 500;
/**
 * Report a bug url.
 * @type {string}
 */
var BUG_LINK = "https://bugzilla.redhat.com/enter_bug.cgi?alias=&assigned_to=pressgang-ccms-dev%40redhat.com&bug_status=NEW&component=DocBook-builder&product=PressGang%20CCMS&version=1.2";

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
 * Keeps a track of how many second pass rest calls are to be made
 * @type {number}
 */
var secondPassRESTCalls = 0;
/**
 * Keeps a track of how many second pass rest calls have been made
 * @type {number}
 */
var secondPassRESTCallsCompleted = 0;
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

/*
	When the page is loaded, start looking for the links that indicate the topics.
 */
$(document).ready(function() {
	firstPass();
	buildMenu();
});

/**
 * When all the assets have been loaded, the second pass can start
 */
$(window).load(function() {secondPass(false, true, false);});
/**
 * If the page takes longer than 30 seconds to load, start the second pass anyway
 */
setTimeout(function() {secondPass(false, false, true);}, SECOND_PASS_TIMEOUT);

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
 * Create and add the icons after the bug or editor links
 * @param topicId The topic ID
 * @param RoleCreatePara The element that held the link that we extracted the ID from.
 */
function addOverlayIcons(topicId, RoleCreatePara) {
    if (topicId != null && topicId.length > 0) {

		if ($.inArray(topicId, topicIds) == -1) {
			topicIds.push(topicId);
			topicSections[topicId] = RoleCreatePara.parentNode;
		}

		var bubbleDiv = document.createElement("div");
        bubbleDiv.style.height = "42px";
        $(bubbleDiv).insertAfter(RoleCreatePara);
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
    $(popover.popoverContent).append($("<h3>WebDAV URLs</h3>"));
    $(popover.popoverContent).append($("<ul><li>http://" + WEBDAV_SERVER + fullPath + "</li><li>webdav://" + WEBDAV_SERVER + fullPath + "</li></ul>"))
    $(popover.popoverContent).append($("<h3>Editing With Cadaver (copy and paste into a terminal):</h3>"));
    $(popover.popoverContent).append($("<p>cadaver http://" + WEBDAV_SERVER + path + "<br/>edit " + topicId + ".xml<br/>exit</p>"));
    $(popover.popoverContent).append($("<p><a href='/16778'>Further Reading</a></p>"));

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

    var legend = $("<div style='padding-left: 8px; padding-right:8px; width: 746px; height: 42px; color: white; background-color: " + BACKGROUND_COLOR + "; display: table-cell; vertical-align: middle; font-weight: bold'><div style='float:left'>\
        <span>KCS Solutions: </span>\
		<span style='color: #5cb85c'>Published</span> \
		<span> | </span> \
		<span style='color: #d9534f'>Unpublished</span>\
        </div>");

    $(popover.popoverTitle).replaceWith(legend);

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
			$.getJSON( SERVER + "/contentspecnodes/get/json/query;csNodeType=0%2C9%2C10;csNodeEntityId=" + topicId + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A+%22nodes%22%7D%2C+%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A+%22inheritedCondition%22%7D%7D%2C+%7B%22trunk%22%3A%7B%22name%22%3A+%22contentSpec%22%7D%2C+%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A+%22children_OTM%22%7D%7D%5D%7D%5D%7D%5D%7D",
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

		var container = document.createElement("div");
		var link = document.createElement("a");
		container.appendChild(link);

		$(link).text(spec.id + ":  " + spec.title + ", " + spec.product + " " + spec.version);
		link.setAttribute("href", "/" + spec);
		specCache[topicId].popover.popoverContent.appendChild(container);
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
			$.getJSON( SERVER + "/topic/get/json/" + topicId + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22tags%22%7D%7D%5D%7D",
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

			$(link).text(tag.name);
			tagsCache[topicId].popover.popoverContent.appendChild(link);
		}
	} else {
		$(tagsCache[topicId].popover.popoverContent).text('[No Tags]');
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

			$.getJSON( SERVER + "/topic/get/json/" + topicId + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22sourceUrls_OTM%22%7D%7D%5D%7D",
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

		$(link).text(urlData.title);
		link.setAttribute("href", urlData.url);

		container.appendChild(link);
		urlCache[topicId].popover.popoverContent.appendChild(container);
	}

	if (urlCache[topicId].popover.popoverContent.innerHTML == '') {
		$(urlCache[topicId].popover.popoverContent).text('[No Source URLs]');
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

	var legend = $("<div style='padding-left: 8px; padding-right:8px; width: 746px; height: 42px; color: white; background-color: " + BACKGROUND_COLOR + "; display: table-cell; vertical-align: middle; font-weight: bold'><div style='float:left'>History. Last revision edited in&nbsp;</div>\
		<div style='width: 25px; height: 26px; float: left; background-image: url(/images/history-blue.png)'/><div style='float:left'>&nbsp;1 Day,&nbsp;</div> \
		<div style='width: 25px; height: 26px; float: left; background-image: url(/images/history-green.png)'/><div style='float:left'>&nbsp;1 Week,&nbsp;</div> \
		<div style='width: 25px; height: 26px; float: left; background-image: url(/images/history-yellow.png)'/><div style='float:left'>&nbsp;1 Month,&nbsp;</div> \
		<div style='width: 25px; height: 26px; float: left; background-image: url(/images/history-orange.png)'/><div style='float:left'>&nbsp;1 Year,&nbsp;</div> \
		<div style='width: 25px; height: 26px; float: left; background-image: url(/images/history-red.png)'/><div style='float:left'>&nbsp;Older&nbsp;</div></div>");

	$(popover.popoverTitle).replaceWith(legend);

	historyCache[topicId] = {popover: popover};

    linkDiv.onmouseover=function(){

        openPopover(popover, linkDiv);

		if (!historyCache[topicId].data) {
			$.getJSON( SERVER + "/topic/get/json/" + topicId + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22revisions%22%2C%20%22start%22%3A0%2C%20%22end%22%3A15%7D%2C%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22logDetails%22%7D%7D%5D%7D%5D%7D",
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
            icon = 'url(/images/rendereddiff-blue.png)';
        } else if (date.isAfter(moment().subtract('week', 1))) {
            icon = 'url(/images/rendereddiff-green.png)';
        } else if (date.isAfter(moment().subtract('month', 1))) {
            icon = 'url(/images/rendereddiff-yellow.png)';
        } else if (date.isAfter(moment().subtract('year', 1))) {
            icon = 'url(/images/rendereddiff-orange.png)';
        } else {
            icon = 'url(/images/rendereddiff-red.png)';
        }


        var link = $("<div><a target='_blank' href='http://" + BASE_SERVER + "/pressgang-ccms-ui-next/#TopicHistoryView;" + topicId + ";" + revision.revision + ";" + historyCache[topicId].data[0].revision + "'><div style='width: 16px; height: 16px; margin-right: 8px; background-image: " + icon + "; background-size: contain; float: left'></div></a>" + revision.revision + " - " + date.format('lll') + " - " + message + "</div>");
		$(historyCache[topicId].popover.popoverContent).append(link);
	}
}

/**
 * Updates the icon used for the history based on how long ago the topic was last edited. Also adds the links to the
 * topics in the various history submenus.
 * @param topicId The topic whose tags popup is being generated.
 * @param title The topic title.
 */
function updateHistoryIcon(topicId, title) {
	var icon = $("#" + topicId + "historyIcon");
	var date = moment(historyCache[topicId].data[0].lastModified);

	// set the icon
	if (date.isAfter(moment().subtract('day', 1))) {
		icon.css('background-image', 'url(/images/history-blue.png)');
	} else if (date.isAfter(moment().subtract('week', 1))) {
		icon.css('background-image', 'url(/images/history-green.png)');
	} else if (date.isAfter(moment().subtract('month', 1))) {
		icon.css('background-image', 'url(/images/history-yellow.png)');
	} else if (date.isAfter(moment().subtract('year', 1))) {
		icon.css('background-image', 'url(/images/history-orange.png)');
	} else {
		icon.css('background-image', 'url(/images/history-red.png)');
	}

	// add the menu icons
	if (date.isAfter(moment().subtract('day', 1))) {
		$('<li><a href="javascript:topicSections[' + topicId + '].scrollIntoView()">' + title + '</a></li>').appendTo($("#topicsEditedIn1DayItems"));
	}

	if (date.isAfter(moment().subtract('week', 1))) {
		$('<li><a href="javascript:topicSections[' + topicId + '].scrollIntoView()">' + title + '</a></li>').appendTo($("#topicsEditedIn1WeekItems"));
	}

	if (date.isAfter(moment().subtract('month', 1))) {
		$('<li><a href="javascript:topicSections[' + topicId + '].scrollIntoView()">' + title + '</a></li>').appendTo($("#topicsEditedIn1MonthItems"));
	}

	if (date.isAfter(moment().subtract('year', 1))) {
		$('<li><a href="javascript:topicSections[' + topicId + '].scrollIntoView()">' + title + '</a></li>').appendTo($("#topicsEditedIn1YearItems"));
	}

	$('<li><a href="javascript:topicSections[' + topicId + '].scrollIntoView()">' + title + '</a></li>').appendTo($("#topicsEditedInOlderThanYearItems"));

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

			$.getJSON( SERVER + "/topic/get/json/" + topicId, function(popover) {
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
 * Renderes the topic description
 * @param topicId The topic whose revisions popup is being generated.
 */
function renderDescription(topicId) {
	if (descriptionCache[topicId].data.trim().length != 0) {
		$(descriptionCache[topicId].popover.popoverContent).text(descriptionCache[topicId].data);
	} else {
		$(descriptionCache[topicId].popover.popoverContent).text("[No Description]");
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

    popover.style.left= linkDiv.parentNode.offsetLeft + 'px';
    popover.style.top= (linkDiv.offsetTop - 300) + 'px';
    popover.style.display = '';
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

/*
 * Finds all the topic ids in a document and adds the topic id to the bottom of the title.
 */
function firstPass() {
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
    linkDiv.style.backgroundImage = "url(/images/" + img + ".png)";
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
            linkDiv.countMarker.style.backgroundImage = "url(/images/" + count + ".png)";
        } else if (count > 10) {
            linkDiv.countMarker.style.backgroundImage = "url(/images/10plus.png)";
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
    $(popoverTitle).text(title);

	popover.popoverTitle = popoverTitle;

    popover.appendChild(popoverTitle);

    var popoverContent = document.createElement("div");
    popoverContent.setAttribute("id", topicId + fixedTitle + "content");
	popoverContent.style.clear = "both";
	popoverContent.style.margin = "8px";
    popoverContent.style.height = "242px";
    popoverContent.style.overflowY = "auto";
	$(popoverContent).text('Loading...');
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

        getTopicDetailsInBacthes();

        // get the spec id
        var specId = getSpecIdFromURL();
        if (specId) {
            getModifiedTopics(specId);

            // getUpdatedTopics and checkSpellingErrors need the topic ids and revisions for the topics in the current
            // spec.
            var topicsUrl = SERVER + "/contentspecnodes/get/json/query;csNodeType=0,9,10;contentSpecIds=" + specId + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22nodes%22%7D%7D%5D%7D";
            $.getJSON(topicsUrl, function(data) {
                var topics = [];
                for (var index = 0, count = data.items.length; index < count; ++index) {
                    var topic = data.items[index].item;
                    if (topic.entityRevision) {
                        topics.push({id: topic.entityId, rev: topic.entityRevision});
                    }
                }

                getTopicNodes(specId, topics, 0);

                // the js file might not be included just yet in all builds
                if (window.Typo) {
                    jQuery.get("/dictionaries/en-US.aff", function(affData) {
                        jQuery.get("/dictionaries/en-US.dic", function(dicData) {
                            var dictionary = new Typo("en_US", affData, dicData);
                            checkSpellingErrors(dictionary, topics, 0, 0);
                        })
                    });
                }
            });

            //getTopReusedTopics(specId);
        }
	}
}

function checkSpellingErrors(dictionary, topics, index, spellingErrors) {
    console.log("Checking spelling " + (index / topics.length * 100).toFixed(2) + "% done");

    if (index < topics.length) {
        var topicUrl = SERVER + "/topic/get/json/" + topics[index].id + "/r/" + topics[index].rev;
        jQuery.getJSON(topicUrl, function(data) {
             try {
                var xmlDoc = jQuery.parseXML();
                var text = jQuery(xmlDoc).text();

                 // remove all xml/html elements
                 var tagRe = /<.*?>/;
                 var tagMatch = null;
                 while ((tagMatch = text.match(tagRe)) != null) {
                     var tagLength = tagMatch[0].length;
                     var replacementString = "";
                     for (var i = 0; i < tagLength; ++i) {
                         replacementString += " ";
                     }
                     text = text.replace(tagRe, replacementString);
                 }

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
                 var urlRe = /\b((?:https?:\/\/|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/i;
                 var urlMatch = null;
                 while ((urlMatch = text.match(urlRe)) != null) {
                     var urlLength = urlMatch[0].length;
                     var replacementString = "";
                     for (var i = 0; i < urlLength; ++i) {
                         replacementString += " ";
                     }
                     text = text.replace(urlRe, replacementString);
                 }

                 // remove all numbers
                 var numberRe = /\b\d+\b/;
                 var numberMatch = null;
                 while ((numberMatch = text.match(numberRe)) != null) {
                     var numberLength = numberMatch[0].length;
                     var replacementString = "";
                     for (var i = 0; i < numberLength; ++i) {
                         replacementString += " ";
                     }
                     text = text.replace(numberRe, replacementString);
                 }

                 // replace any character that doesn't make up a word with a space, and then split on space
                 var words = text.replace(/[^a-zA-Z0-9'\\-]/g, ' ').split(/\s/);

                 for (var wordIndex = 0, wordCount = words.length; wordIndex < wordCount; ++wordIndex) {
                     var word = words[wordIndex];
                     if (!dictionary.check(word)) {

                         ++spellingErrors;

                         var suggestions = dictionary.suggest(word);

                         var button = '<div class="btn-group" style="margin-bottom: 8px;">\
                             <button type="button" class="btn btn-default" style="width:230px; white-space: normal;" onclick="javascript:topicSections[' + topic.id + '].scrollIntoView()">' + word + '</button>\
                             <button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" style="position: absolute; top:0; bottom: 0">\
                                 <span class="caret"></span>\
                             </button>\
                             <ul class="dropdown-menu" role="menu">';

                             for (var suggestionsIndex = 0, suggestionsCount = suggestions.length; suggestionsIndex < suggestionsCount; ++suggestionsIndex) {
                                 button += '<li><a href="javascript:null">' + suggestions[suggestionsIndex] + '</a></li>';
                             }

                             button += '</ul>\
                                 </div>';


                         jQuery(button).appendTo($("#spellingErrorsItems"));
                     }
                 }

                 checkSpellingErrors(topics, ++index, spellingErrors);
             } catch (e) {
                 checkSpellingErrors(topics, ++index, spellingErrors);
             }
        });
    } else {
        jQuery('#spellingErrors').append($('<span class="badge pull-right">' + spellingErrors + '</span>'));
    }
}

function getTopReusedTopics(specId) {
    var specProductUrl = SERVER + "/contentspecnodes/get/json/query;csNodeType=7;contentSpecIds=" + specId + "?expand=" + encodeURIComponent("{\"branches\":[{\"trunk\":{\"name\": \"nodes\"}}]}");
    jQuery.getJSON(specProductUrl, function(data) {
        for (var nodeIndex = 0, nodeCount = data.items.length; nodeIndex < nodeCount; ++nodeIndex) {
            var node = data.items[nodeIndex].item;
            if (node.title == "Product") {
                var product = node.additionalText;

                var specsUrl = SERVER + "/contentspecs/get/json/query;contentSpecProduct=" + encodeURIComponent(product) + "?expand=" + encodeURIComponent("{\"branches\":[{\"trunk\":{\"name\": \"contentSpecs\"}, \"branches\":[{\"trunk\":{\"name\": \"topics\"}, \"branches\":[{\"trunk\":{\"name\": \"contentSpecs_OTM\"}}]}]}]}]}");

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
 * Every topic that has been found in the book has its details populated by a series
 * of batched REST requests delayed to help prevent high load on the server.
 */
function getTopicDetailsInBacthes() {
    // fire off rest queries requesting information on topics in batches
    var topicBacthSize = 15;
    var topicIdsString = "";
    var delay = SECOND_PASS_REST_CALL_DELAY;
    for (var index = 0, count = topicIds.length; index < count; ++index) {
        if (topicIdsString.length != 0) {
            topicIdsString += ",";
        }

        topicIdsString += topicIds[index];

        if (index != 0 && index % topicBacthSize == 0) {
            ++secondPassRESTCalls;
            setTimeout(function(topicIdsString) {
                return function() {
                    doSecondPassQuery(topicIdsString);
                }
            }(topicIdsString), delay);
            delay += SECOND_PASS_REST_CALL_DELAY;
            topicIdsString = "";
        }
    }

    // query the remaining topics not picked up in the for loop above
    if (topicIdsString.length != 0) {
        ++secondPassRESTCalls;
        setTimeout(function(topicIdsString) {
            return function() {
                doSecondPassQuery(topicIdsString);
            }
        }(topicIdsString), delay);
    }
}

function getTopicNodes(specId, topics, count) {
    if (topics.length != 0) {
        var topic = topics.pop();
        var topicNodesUrl = SERVER + "/contentspecnodes/get/json/query;csNodeEntityId=" + topic.id + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22nodes%22%7D%2C%20%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22contentSpec%22%7D%7D%5D%7D%5D%7D%0A%0A";
        $.getJSON(topicNodesUrl, function(topicNodeData) {
            var newerTopicRevisions = [];
            for (var topicNodeIndex = 0, topicNodeCount = topicNodeData.items.length; topicNodeIndex < topicNodeCount; ++topicNodeIndex) {
                var topicNode = topicNodeData.items[topicNodeIndex].item;
                if (topicNode.contentSpec.id != specId) {
                    if (topicNode.entityRevision && topicNode.entityRevision > topic.rev) {
                        newerTopicRevisions.push({spec: topicNode.contentSpec.id, rev: topicNode.entityRevision});
                    }
                }
            }

            if (newerTopicRevisions.length != 0) {
                var button = '<div class="btn-group" style="margin-bottom: 8px;">\
                    <button type="button" class="btn btn-default" style="width:230px; white-space: normal;" onclick="javascript:topicSections[' + topic.id + '].scrollIntoView()">Topic: ' + topic.id + ' Rev: ' + topic.rev + '</button>\
                    <button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" style="position: absolute; top:0; bottom: 0">\
                        <span class="caret"></span>\
                    </button>\
                    <ul class="dropdown-menu" role="menu">';

                for (var newerTopicRevisionIndex = 0, newerTopicRevisionCount = newerTopicRevisions.length; newerTopicRevisionIndex < newerTopicRevisionCount; ++newerTopicRevisionIndex) {
                    button += '<li><a href="http://' + BASE_SERVER + '/pressgang-ccms-ui-next/#TopicHistoryView;' + topic.id + ';' + topic.rev + ';' + newerTopicRevisions[newerTopicRevisionIndex].rev + '">Spec: ' + newerTopicRevisions[newerTopicRevisionIndex].spec + " Rev: " + newerTopicRevisions[newerTopicRevisionIndex].rev + '</a></li>';
                }

                button += '</ul>\
                    </div>';

                $(button).appendTo($("#topicsUpdatedInOtherSpecsItems"));

                ++count;
            }

            getTopicNodes(topics, count);
        });
    } else {
        $('#topicsUpdatedInOtherSpecs').append($('<span class="badge pull-right">' + count + '</span>'));
    }
}



function getModifiedTopics(specId) {
    // get content spec revisions
    var revisionsURL = SERVER + "/contentspec/get/json/" + specId + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22revisions%22%7D%7D%5D%7D";

    $.getJSON(revisionsURL, function(data) {
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

            // add the results to the menu
            $('#topicsAddedIn1Day').append($('<span class="badge pull-right">' + specRevisionCache[specRevisionCache.day].added.length + '</span>'));
            for (var topicIndex = 0, topicCount = specRevisionCache[specRevisionCache.day].added.length; topicIndex < topicCount; ++topicIndex) {
                var topic = specRevisionCache[specRevisionCache.day].added[topicIndex];
                $('<li><a href="javascript:topicSections[' + topic + '].scrollIntoView()">' + topic + '</a></li>').appendTo($("#topicsAddedSince1DayItems"));
            }

            $('#topicsAddedIn1Week').append($('<span class="badge pull-right">' + specRevisionCache[specRevisionCache.week].added.length + '</span>'));
            for (var topicIndex = 0, topicCount = specRevisionCache[specRevisionCache.week].added.length; topicIndex < topicCount; ++topicIndex) {
                var topic = specRevisionCache[specRevisionCache.week].added[topicIndex];
                $('<li><a href="javascript:topicSections[' + topic + '].scrollIntoView()">' + topic + '</a></li>').appendTo($("#topicsAddedSince1WeekItems"));
            }

            $('#topicsAddedIn1Month').append($('<span class="badge pull-right">' + specRevisionCache[specRevisionCache.month].added.length + '</span>'));
            for (var topicIndex = 0, topicCount = specRevisionCache[specRevisionCache.month].added.length; topicIndex < topicCount; ++topicIndex) {
                var topic = specRevisionCache[specRevisionCache.month].added[topicIndex];
                $('<li><a href="javascript:topicSections[' + topic + '].scrollIntoView()">' + topic + '</a></li>').appendTo($("#topicsAddedSince1MonthItems"));
            }

            $('#topicsAddedIn1Year').append($('<span class="badge pull-right">' + specRevisionCache[specRevisionCache.year].added.length + '</span>'));
            for (var topicIndex = 0, topicCount = specRevisionCache[specRevisionCache.year].added.length; topicIndex < topicCount; ++topicIndex) {
                var topic = specRevisionCache[specRevisionCache.year].added[topicIndex];
                $('<li><a href="javascript:topicSections[' + topic + '].scrollIntoView()">' + topic + '</a></li>').appendTo($("#topicsAddedSince1YearItems"));
            }

            $('#topicsRemovedIn1Day').append($('<span class="badge pull-right">' + specRevisionCache[specRevisionCache.day].removed.length + '</span>'));
            for (var topicIndex = 0, topicCount = specRevisionCache[specRevisionCache.day].removed.length; topicIndex < topicCount; ++topicIndex) {
                var topic = specRevisionCache[specRevisionCache.day].removed[topicIndex];
                $('<li><a href="javascript:topicSections[' + topic + '].scrollIntoView()">' + topic + '</a></li>').appendTo($("#topicsRemovedSince1DayItems"));
            }

            $('#topicsRemovedIn1Week').append($('<span class="badge pull-right">' + specRevisionCache[specRevisionCache.week].removed.length + '</span>'));
            for (var topicIndex = 0, topicCount = specRevisionCache[specRevisionCache.week].removed.length; topicIndex < topicCount; ++topicIndex) {
                var topic = specRevisionCache[specRevisionCache.week].removed[topicIndex];
                $('<li><a href="javascript:topicSections[' + topic + '].scrollIntoView()">' + topic + '</a></li>').appendTo($("#topicsRemovedSince1WeekItems"));
            }

            $('#topicsRemovedIn1Month').append($('<span class="badge pull-right">' + specRevisionCache[specRevisionCache.month].removed.length + '</span>'));
            for (var topicIndex = 0, topicCount = specRevisionCache[specRevisionCache.month].removed.length; topicIndex < topicCount; ++topicIndex) {
                var topic = specRevisionCache[specRevisionCache.month].removed[topicIndex];
                $('<li><a href="javascript:topicSections[' + topic + '].scrollIntoView()">' + topic + '</a></li>').appendTo($("#topicsRemovedSince1MonthItems"));
            }

            $('#topicsRemovedIn1Year').append($('<span class="badge pull-right">' + specRevisionCache[specRevisionCache.year].removed.length + '</span>'));
            for (var topicIndex = 0, topicCount = specRevisionCache[specRevisionCache.year].removed.length; topicIndex < topicCount; ++topicIndex) {
                var topic = specRevisionCache[specRevisionCache.year].removed[topicIndex];
                $('<li><a href="javascript:topicSections[' + topic + '].scrollIntoView()">' + topic + '</a></li>').appendTo($("#topicsRemovedSince1YearItems"));
            }

            // create the graphs
            var values = [
                specRevisionCache[specRevisionCache.day].added.length,
                specRevisionCache[specRevisionCache.week].added.length,
                specRevisionCache[specRevisionCache.month].added.length,
                specRevisionCache[specRevisionCache.year].added.length];

            var labels = ["day", "week", "month", "year"];
            var colors = [Raphael.rgb(0, 254, 254), Raphael.rgb(0, 254, 0), Raphael.rgb(254, 254, 0), Raphael.rgb(254, 127, 0)];

            var offscreenDiv = $('<div id="topicsAddedSinceChart"></div>');
            offscreenDiv.appendTo(offscreenRendering);

            setTimeout(function(offscreenDiv, values, labels, colors) {
                return function(){
                    Raphael("topicsAddedSinceChart", 250, 250).pieChart(125, 125, 50, values, labels, colors, 30, 30, 16, "#fff");
                    $(offscreenDiv).appendTo($("#topicsAddedSincePanel"));
                }
            }(offscreenDiv, values, labels, colors), 0);


            var values = [
                specRevisionCache[specRevisionCache.day].removed.length ,
                specRevisionCache[specRevisionCache.week].removed.length,
                specRevisionCache[specRevisionCache.month].removed.length,
                specRevisionCache[specRevisionCache.year].removed.length];

            var offscreenDiv = $('<div id="topicsRemovedSinceChart"></div>');
            offscreenDiv.appendTo(offscreenRendering);

            setTimeout(function(offscreenDiv, values, labels, colors) {
                return function(){
                    Raphael("topicsRemovedSinceChart", 250, 250).pieChart(125, 125, 50, values, labels, colors, 30, 30, 16, "#fff");
                    $(offscreenDiv).appendTo($("#topicsRemovedSincePanel"));
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
	var spec = SERVER + "/contentspec/get/json/" + specId + "/r/" + revision + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22children_OTM%22%7D%7D%5D%7D";
	var topics = {};

	$.getJSON(spec, function(data) {
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
	var specRevision = SERVER + "/contentspec/get/json/" + specId + "/?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22children_OTM%22%7D%7D%5D%7D";
	var topics = {};

	$.getJSON(specRevision, function(data) {
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
	var children = SERVER + "/contentspecnode/get/json/" + nodeId + "/r/" + revision + "/?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22children_OTM%22%7D%7D%5D%7D";

	$.getJSON(children, function(data) {
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
 * Getting the information on the topics in the spec is done in batches. Each batch is processed by this function.
 * @param topicIdsString The comma separated list of topic ids to query.
 */
function doSecondPassQuery(topicIdsString) {
	$.getJSON(BACKGROUND_QUERY_PREFIX + topicIdsString + BACKGROUND_QUERY_POSTFIX, function (data, textStatus, jqXHR) {
		++secondPassRESTCallsCompleted;
		if (data && data.items) {
			for (var topicIndex = 0, topicCount = data.items.length; topicIndex < topicCount; ++topicIndex) {
				var topic = data.items[topicIndex].item;

                if (!topicNames[topic.id]) {
                    topicNames[topic.id] = topic.title;
                }

				// set the description
				descriptionCache[topic.id].data = topic.description && topic.description.trim().length != 0 ? topic.description : "[No Description]";

				// set the revisions
				historyCache[topic.id].data = [];
				for (var revisionIndex = 0, revisionCount = topic.revisions.items.length; revisionIndex < revisionCount; ++revisionIndex) {
					var revision = topic.revisions.items[revisionIndex].item;
					historyCache[topic.id].data.push({
						revision: revision.revision,
						message: revision.logDetails.message,
						lastModified: revision.lastModified});
				}

				// set the tags
				tagsCache[topic.id].data = [];
				for (var tagIndex = 0, tagCount = topic.tags.items.length; tagIndex < tagCount; ++tagIndex) {
					var tag = topic.tags.items[tagIndex].item;
                    tagsCache[topic.id].data.push({
                        name: tag.name,
                        id: tag.id
                    });
				}

				// set the urls
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

				// set the specs
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
							} if (child.title == "Title") {
								specDetails.title = child.additionalText;
							}
						}
						specs[spec.id] = specDetails;
					}
				}

				for (spec in specs) {
					specCache[topic.id].data.push(specs[spec]);
				}

				updateHistoryIcon(topic.id, topic.title);

				updateCount(topic.id + "historyIcon", historyCache[topic.id].data.length);
				updateCount(topic.id + "urlsIcon", urlCache[topic.id].data.length);
				updateCount(topic.id + "tagsIcon", tagsCache[topic.id].data.length);
				updateCount(topic.id + "bookIcon", specCache[topic.id].data.length);
			}
		} else {
			console.log("Bad request");
		}

		// Call some functions when all the data is availble.
		if (secondPassRESTCallsCompleted == secondPassRESTCalls) {
			console.log("Second pass completed");
			buildTopicEditedInChart();

			// at this point we are ready to start the third pass (an email report)
			thirdPass(true, false);
		}
	});
}

function thirdPass(mySecondPassDone, mySpecHistoryDone) {
	if (mySecondPassDone) {
		secondPassDone = true;
	}

	if (mySpecHistoryDone) {
		specHistoryDone = true;
	}

	if (secondPassDone && specHistoryDone) {

        // the function to call when all incompatibilities have been found
        var reportIncompatibilities = function(usedLicenses, incompatibleLicenses) {

            $('#licensesPresent').append($('<span class="badge pull-right">' + countKeys(usedLicenses) + '</span>'));

            for (var tag in usedLicenses) {

                $('<li><a href="javascript:hideAllMenus(); sideMenus[\'' + usedLicenses[tag].name + '\'].show();">' + usedLicenses[tag].name + '<span class="badge pull-right">' + usedLicenses[tag].topics.length + '</span></a></li>').appendTo($("#licensesPresentItems"));

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

                var licenseMenu =  $(newMenuString);
                // so we can reference this menu in code
                sideMenus[usedLicenses[tag].name] = licenseMenu
                // so all menus will be closed
                sideMenus.push(licenseMenu);
                $(document.body).append(licenseMenu);
                licenseMenu.hide();
            }

            var licenseConflictCount = 0;
            for (var licenseIndex = 0, licenseCount = incompatibleLicenses.length; licenseIndex < licenseCount; ++licenseIndex) {
                 var licenseDetails = incompatibleLicenses[licenseIndex];
                 if (usedLicenses[licenseDetails.license1] && usedLicenses[licenseDetails.license2]) {
                     ++licenseConflictCount;
                     $('<li><a href="http://' + BASE_SERVER + '/pressgang-ccms-ui-next/#SearchResultsAndTopicView;query;topicIds=' + licenseDetails.topicId + '">' + usedLicenses[licenseDetails.license1].name + " / " + usedLicenses[licenseDetails.license2].name + '</a></li>').appendTo($("#licenseConflictsItems"));
                 }
            }

            $('#licenseConflicts').append($('<span class="badge pull-right">' + licenseConflictCount + '</span>'));
        }

        // find all the tags in the license category
        var categoryQuery = SERVER + "/category/get/json/" + LICENSE_CATEGORY + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A+%22tags%22%7D%7D%5D%7D";
        $.getJSON(categoryQuery, function(data) {

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
                    var query = SERVER + "/topics/get/json/query;catint" + LICENSE_CATEGORY + "=And;tag" + LICENSE_INCOMPATIBILITY_TAG + "=1;tag" + license1 + "=1;tag" + license2 + "=1;logic=And?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22topics%22%7D%7D%5D%7D";

                    $.getJSON(query, function(license1, license2) {
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
 * Hides all the side bar menus
 */
function hideAllMenus() {
	for (var menuIndex = 0, menuCount = sideMenus.length; menuIndex < menuCount; ++menuIndex) {
        sideMenus[menuIndex].hide();
    }
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

	$('#topicsEditedIn1Day').append($('<span class="badge pull-right">' + historyCache.summary.day + '</span>'));
	$('#topicsEditedIn1Week').append($('<span class="badge pull-right">' + historyCache.summary.week + '</span>'));
	$('#topicsEditedIn1Month').append($('<span class="badge pull-right">' + historyCache.summary.month + '</span>'));
	$('#topicsEditedIn1Year').append($('<span class="badge pull-right">' + historyCache.summary.year + '</span>'));
	$('#topicsEditedInOlderThanYear').append($('<span class="badge pull-right">' + historyCache.summary.older + '</span>'));

	var values = [
		historyCache.summary.day / totalCount * 100.0,
		historyCache.summary.week / totalCount * 100.0,
		historyCache.summary.month / totalCount * 100.0,
		historyCache.summary.year / totalCount * 100.0,
		historyCache.summary.older / totalCount * 100.0];

	var labels = ["day", "week", "month", "year", "older"];
	var colors = [Raphael.rgb(0, 254, 254), Raphael.rgb(0, 254, 0), Raphael.rgb(254, 254, 0), Raphael.rgb(254, 127, 0), Raphael.rgb(254, 0, 0)];

	var offscreenDiv = $('<div id="topicEditedInChart"></div>');
	offscreenDiv.appendTo(offscreenRendering);

	setTimeout(function(offscreenDiv, values, labels, colors) {
		return function(){
			Raphael("topicEditedInChart", 250, 250).pieChart(125, 125, 50, values, labels, colors, 30, 30, 16, "#fff");
			$(offscreenDiv).appendTo($("#topicsEditedInPanel"));
		}
	}(offscreenDiv, values, labels, colors), 0);
}

/**
 * When the side menu is visible, we adjust the margin on the document so that it
 * appears to the right of the menu.
 */
function showMenu() {
    document.body.style.margin = scheduleHeight + "px auto auto 350px";
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

/**
 * Builds the side bar. Each menu is a separate panel that is shown or hidden as the user navigates through.
 */
function buildMenu() {
	// A place to do off screen rendering, to work around a Rapael bug
	offscreenRendering = $('<div id="offscreenRendering" style="position: absolute; left: -1000px; top: -1000px"></div>');
	$(document.body).append(offscreenRendering);

	// the icon used to show the initil menu
	menuIcon = $('<div id="openpressgangmenu" onclick="hideAllMenus(); mainMenu.show(); showMenu(); localStorage.setItem(\'lastMenu\', \'mainMenu\');" style="cursor: pointer; position: fixed; top: 8px; left: 8px; width: 64px; height: 64px; background-image: url(/images/pressgang.svg); background-size: contain"></div>')
	$(document.body).append(menuIcon);

    // this is the help icon available on each menu
    var help = '<span style="float: right; font-size: 16px;" class="glyphicon glyphicon-question-sign" onclick="javascript:pressgang_website_enable()"></span>';

	// each menu is a Bootstrap panel with vertically stacked nav pills.
	mainMenu = $('\
		<div class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'PressGang</div>\
				<div class="panel-body ">\
		            <ul class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); hideMenu(); menuIcon.show(); localStorage.setItem(\'lastMenu\', \'menuIcon\');">Hide Menu</a></li>\
						<li data-pressgangtopic="24793" style="background-color: white"><a href="javascript:hideAllMenus(); topicsByLastEdit.show(); localStorage.setItem(\'lastMenu\', \'topicsByLastEdit\');">Topics By Last Edit</a></li>\
						<li data-pressgangtopic="24794" style="background-color: white"><a href="javascript:hideAllMenus(); topicsAddedSince.show(); localStorage.setItem(\'lastMenu\', \'topicsAddedSince\');">Topics Added In</a></li>\
						<li data-pressgangtopic="24792" style="background-color: white"><a href="javascript:hideAllMenus(); topicsRemovedSince.show(); localStorage.setItem(\'lastMenu\', \'topicsRemovedSince\');">Topics Removed In</a></li>\
						<li data-pressgangtopic="24800" style="background-color: white"><a href="javascript:hideAllMenus(); licenses.show(); localStorage.setItem(\'lastMenu\', \'licenses\');">Licenses</a></li>\
						<li data-pressgangtopic="24787" style="background-color: white"><a id="bugzillaBugs" href="javascript:hideAllMenus(); bugzillaBugs.show(); localStorage.setItem(\'lastMenu\', \'bugzillaBugs\');">Bugzilla Bugs</a></li>\
						<li data-pressgangtopic="24789" style="background-color: white"><a id="topicsUpdatedInOtherSpecs" href="javascript:hideAllMenus(); topicsUpdatedInOtherSpecs.show(); localStorage.setItem(\'lastMenu\', \'topicsUpdatedInOtherSpecs\');">Updated Topics</a></li>\
						<li data-pressgangtopic="00000" style="background-color: white"><a id="spellingErrors" href="javascript:hideAllMenus(); spellingErrors.show(); localStorage.setItem(\'lastMenu\', \'spellingErrors\');">Spelling Errors</a></li>\
						<li data-pressgangtopic="24805" style="background-color: white"><a href="' + BUG_LINK + '&cf_build_id=Content%20Spec%20ID:%20' + SPEC_ID + '">Report a bug</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
	$(document.body).append(mainMenu);
    sideMenus.push(mainMenu);

    spellingErrors = $('\
		<div data-pressgangtopic="0000" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Spelling Errors</div>\
				<div id="topicsRemovedSincePanel" class="panel-body ">\
		            <ul id="spellingErrorsItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
    $(document.body).append(spellingErrors);
    sideMenus.push(spellingErrors);

    topReusedTopics = $('\
		<div data-pressgangtopic="0000" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Top Reused Topics</div>\
				<div id="topicsRemovedSincePanel" class="panel-body ">\
		            <ul id="topReusedTopicsItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
    $(document.body).append(topReusedTopics);
    sideMenus.push(topReusedTopics);

    topicsUpdatedInOtherSpecs = $('\
		<div data-pressgangtopic="24789" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Updated Topics</div>\
				<div id="topicsRemovedSincePanel" class="panel-body ">\
		            <ul id="topicsUpdatedInOtherSpecsItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
    $(document.body).append(topicsUpdatedInOtherSpecs);
    sideMenus.push(topicsUpdatedInOtherSpecs);

	topicsAddedSince = $('\
		<div data-pressgangtopic="24794" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Topics Added In</div>\
				<div id="topicsAddedSincePanel" class="panel-body ">\
		            <ul class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li ><a id="topicsAddedIn1Day" href="javascript:hideAllMenus(); topicsAddedSince1Day.show(); localStorage.setItem(\'lastMenu\', \'topicsAddedSince1Day\');"><div style="background-image: url(/images/history-blue.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Day</a></li>\
						<li ><a id="topicsAddedIn1Week" href="javascript:hideAllMenus(); topicsAddedSince1Week.show(); localStorage.setItem(\'lastMenu\', \'topicsAddedSince1Week\');"><div style="background-image: url(/images/history-green.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Week</a></li>\
						<li ><a id="topicsAddedIn1Month" href="javascript:hideAllMenus(); topicsAddedSince1Month.show(); localStorage.setItem(\'lastMenu\', \'topicsAddedSince1Month\');"><div style="background-image: url(/images/history-yellow.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Month</a></li>\
						<li ><a id="topicsAddedIn1Year" href="javascript:hideAllMenus(); topicsAddedSince1Year.show(); localStorage.setItem(\'lastMenu\', \'topicsAddedSince1Year\');"><div style="background-image: url(/images/history-orange.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Year</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
	$(document.body).append(topicsAddedSince);
    sideMenus.push(topicsAddedSince);

	topicsAddedSince1Day = $('\
		<div data-pressgangtopic="24794" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Topics Added In 1 Day</div>\
				<div class="panel-body ">\
		            <ul id="topicsAddedSince1DayItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); topicsAddedSince.show(); localStorage.setItem(\'lastMenu\', \'topicsAddedSince\');">&lt;- Topics Added In</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
	$(document.body).append(topicsAddedSince1Day);
    sideMenus.push(topicsAddedSince1Day);

	topicsAddedSince1Week = $('\
		<div data-pressgangtopic="24794" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Topics Added In 1 Week</div>\
				<div class="panel-body ">\
		            <ul id="topicsAddedSince1WeekItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); topicsAddedSince.show(); localStorage.setItem(\'lastMenu\', \'topicsAddedSince\');">&lt;- Topics Added In</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
	$(document.body).append(topicsAddedSince1Week);
    sideMenus.push(topicsAddedSince1Week);

	topicsAddedSince1Month = $('\
		<div data-pressgangtopic="24794" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Topics Added In 1 Month</div>\
				<div class="panel-body ">\
		            <ul id="topicsAddedSince1MonthItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); topicsAddedSince.show(); localStorage.setItem(\'lastMenu\', \'topicsAddedSince\');">&lt;- Topics Added In</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
	$(document.body).append(topicsAddedSince1Month);
    sideMenus.push(topicsAddedSince1Month);

	topicsAddedSince1Year = $('\
		<div data-pressgangtopic="24794" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Topics Added In 1 Year</div>\
				<div class="panel-body ">\
		            <ul id="topicsAddedSince1YearItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); topicsAddedSince.show(); localStorage.setItem(\'lastMenu\', \'topicsAddedSince\');">&lt;- Topics Added In</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
	$(document.body).append(topicsAddedSince1Year);
    sideMenus.push(topicsAddedSince1Year);

	topicsRemovedSince = $('\
		<div data-pressgangtopic="24792" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Topics Removed Since</div>\
				<div id="topicsRemovedSincePanel" class="panel-body ">\
		            <ul class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li ><a id="topicsRemovedIn1Day" href="javascript:hideAllMenus(); topicsRemovedSince1Day.show(); localStorage.setItem(\'lastMenu\', \'topicsRemovedSince1Day\');"><div style="background-image: url(/images/history-blue.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Day</a></li>\
						<li ><a id="topicsRemovedIn1Week" href="javascript:hideAllMenus(); topicsRemovedSince1Week.show(); localStorage.setItem(\'lastMenu\', \'topicsRemovedSince1Week\');"><div style="background-image: url(/images/history-green.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Week</a></li>\
						<li ><a id="topicsRemovedIn1Month" href="javascript:hideAllMenus(); topicsRemovedSince1Month.show(); localStorage.setItem(\'lastMenu\', \'topicsRemovedSince1Month\');"><div style="background-image: url(/images/history-yellow.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Month</a></li>\
						<li ><a id="topicsRemovedIn1Year" href="javascript:hideAllMenus(); topicsRemovedSince1Year.show(); localStorage.setItem(\'lastMenu\', \'topicsRemovedSince1Year\');"><div style="background-image: url(/images/history-orange.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Year</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
	$(document.body).append(topicsRemovedSince);
    sideMenus.push(topicsRemovedSince);

	topicsRemovedSince1Day = $('\
		<div data-pressgangtopic="24792" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Topics Removed In 1 Day</div>\
				<div class="panel-body ">\
		            <ul id="topicsRemovedSince1DayItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); topicsRemovedSince.show(); localStorage.setItem(\'lastMenu\', \'topicsRemovedSince\');">&lt;- Topics Removed In</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
	$(document.body).append(topicsRemovedSince1Day);
    sideMenus.push(topicsRemovedSince1Day);

	topicsRemovedSince1Week = $('\
		<div data-pressgangtopic="24792" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Topics Removed In 1 Week</div>\
				<div class="panel-body ">\
		            <ul id="topicsRemovedSince1WeekItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); topicsRemovedSince.show(); localStorage.setItem(\'lastMenu\', \'topicsRemovedSince\');">&lt;- Topics Removed In</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
	$(document.body).append(topicsRemovedSince1Week);
    sideMenus.push(topicsRemovedSince1Week);

	topicsRemovedSince1Month = $('\
		<div data-pressgangtopic="24792" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Topics Removed In 1 Month</div>\
				<div class="panel-body ">\
		            <ul id="topicsRemovedSince1MonthItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); topicsRemovedSince.show(); localStorage.setItem(\'lastMenu\', \'topicsRemovedSince\');">&lt;- Topics Removed In</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
	$(document.body).append(topicsRemovedSince1Month);
    sideMenus.push(topicsRemovedSince1Month);

	topicsRemovedSince1Year = $('\
		<div data-pressgangtopic="24792" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Topics Removed In 1 Year</div>\
				<div class="panel-body ">\
		            <ul id="topicsRemovedSince1YearItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); topicsRemovedSince.show(); localStorage.setItem(\'lastMenu\', \'topicsRemovedSince\');">&lt;- Topics Removed In</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
	$(document.body).append(topicsRemovedSince1Year);
    sideMenus.push(topicsRemovedSince1Year);

	topicsByLastEdit = $('\
		<div data-pressgangtopic="24793" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Topics By Last Edit</div>\
				<div id="topicsEditedInPanel" class="panel-body ">\
		            <ul class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li ><a id="topicsEditedIn1Day" href="javascript:hideAllMenus(); topicsEditedIn1Day.show(); localStorage.setItem(\'lastMenu\', \'topicsEditedIn1Day\');"><div style="background-image: url(/images/history-blue.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Day</a></li>\
						<li ><a id="topicsEditedIn1Week" href="javascript:hideAllMenus(); topicsEditedIn1Week.show(); localStorage.setItem(\'lastMenu\', \'topicsEditedIn1Week\');"><div style="background-image: url(/images/history-green.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Week</a></li>\
						<li ><a id="topicsEditedIn1Month" href="javascript:hideAllMenus(); topicsEditedIn1Month.show(); localStorage.setItem(\'lastMenu\', \'topicsEditedIn1Month\');"><div style="background-image: url(/images/history-yellow.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Month</a></li>\
						<li ><a id="topicsEditedIn1Year" href="javascript:hideAllMenus(); topicsEditedIn1Year.show(); localStorage.setItem(\'lastMenu\', \'topicsEditedIn1Year\');"><div style="background-image: url(/images/history-orange.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>1 Year</a></li>\
						<li ><a id="topicsEditedInOlderThanYear" href="javascript:hideAllMenus(); topicsEditedInOlderThanYear.show(); localStorage.setItem(\'lastMenu\', \'topicsEditedInOlderThanYear\');"><div style="background-image: url(/images/history-red.png); float: left; margin-right: 3px;height: 18px;width: 18px;background-size: cover;"></div>Older than a year</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
	$(document.body).append(topicsByLastEdit);
    sideMenus.push(topicsByLastEdit);

	topicsEditedIn1Day = $('\
		<div data-pressgangtopic="24793" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Topics Edited In 1 Day</div>\
				<div class="panel-body ">\
		            <ul id="topicsEditedIn1DayItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); topicsByLastEdit.show(); localStorage.setItem(\'lastMenu\', \'topicsByLastEdit\');">&lt;- Topics By Last Edit</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
	$(document.body).append(topicsEditedIn1Day);
    sideMenus.push(topicsEditedIn1Day);

	topicsEditedIn1Week = $('\
		<div data-pressgangtopic="24793" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Topics Edited In 1 Week</div>\
				<div class="panel-body ">\
		            <ul id="topicsEditedIn1WeekItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); topicsByLastEdit.show(); localStorage.setItem(\'lastMenu\', \'topicsByLastEdit\');">&lt;- Topics By Last Edit</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
	$(document.body).append(topicsEditedIn1Week);
    sideMenus.push(topicsEditedIn1Week);

	topicsEditedIn1Month = $('\
		<div data-pressgangtopic="24793" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Topics Edited In 1 Month</div>\
				<div class="panel-body ">\
		            <ul id="topicsEditedIn1MonthItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); topicsByLastEdit.show(); localStorage.setItem(\'lastMenu\', \'topicsByLastEdit\');">&lt;- Topics By Last Edit</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
	$(document.body).append(topicsEditedIn1Month);
    sideMenus.push(topicsEditedIn1Month);

	topicsEditedIn1Year = $('\
		<div data-pressgangtopic="24793" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Topics Edited In 1 Year</div>\
				<div class="panel-body ">\
		            <ul id="topicsEditedIn1YearItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); topicsByLastEdit.show(); localStorage.setItem(\'lastMenu\', \'topicsByLastEdit\');">&lt;- Topics By Last Edit</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
	$(document.body).append(topicsEditedIn1Year);
    sideMenus.push(topicsEditedIn1Year);


	topicsEditedInOlderThanYear = $('\
		<div data-pressgangtopic="24793" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Topics Edited Prior To 1 Year</div>\
				<div class="panel-body ">\
		            <ul id="topicsEditedInOlderThanYearItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); topicsByLastEdit.show(); localStorage.setItem(\'lastMenu\', \'topicsByLastEdit\');">&lt;- Topics By Last Edit</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
	$(document.body).append(topicsEditedInOlderThanYear);
    sideMenus.push(topicsEditedInOlderThanYear);

    licenses = $('\
		<div data-pressgangtopic="24800" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Licenses</div>\
				<div class="panel-body ">\
		            <ul class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a id="licensesPresent" href="javascript:hideAllMenus(); licensesPresent.show(); localStorage.setItem(\'lastMenu\', \'licensesPresent\');">Licenses Present</a></li>\
						<li><a id="licenseConflicts" href="javascript:hideAllMenus(); licenseConflicts.show(); localStorage.setItem(\'lastMenu\', \'licenseConflicts\');">License Conflicts</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>');
    $(document.body).append(licenses);
    sideMenus.push(licenses);

    licensesPresent = $('\
		<div data-pressgangtopic="24800" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Licenses Present</div>\
				<div class="panel-body ">\
		            <ul id="licensesPresentItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); licenses.show(); localStorage.setItem(\'lastMenu\', \'licenses\');">&lt;- Licenses</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>');
    $(document.body).append(licensesPresent);
    sideMenus.push(licensesPresent);

    licenseConflicts = $('\
		<div data-pressgangtopic="24800" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Licenses Conflicts</div>\
				<div class="panel-body ">\
		            <ul id="licenseConflictsItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); licenses.show(); localStorage.setItem(\'lastMenu\', \'licenses\');">&lt;- Licenses</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>');
    $(document.body).append(licenseConflicts);
    sideMenus.push(licenseConflicts);

    bugzillaBugs = $('\
		<div data-pressgangtopic="24787" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Bugzilla Bugs</div>\
				<div id="bugzillaBugsPanel" class="panel-body ">\
		            <ul id="bugzillaBugsItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a id="newBugzillaBugs" href="javascript:hideAllMenus(); newBugzillaBugs.show(); localStorage.setItem(\'lastMenu\', \'newBugzillaBugs\');">New</a></li>\
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
    $(document.body).append(bugzillaBugs);
    sideMenus.push(bugzillaBugs);

    newBugzillaBugs = $('\
		<div data-pressgangtopic="24787" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'New Bugzilla Bugs</div>\
				<div class="panel-body ">\
		            <ul id="newBugzillaBugsItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); bugzillaBugs.show(); localStorage.setItem(\'lastMenu\', \'bugzillaBugs\');">&lt;- Bugzilla Bugs</a></li>\
						<li><a id="newBugzillaBugsPlaceholder" href="/PressZilla.user.js">This menu requires the PressZilla GreaseMonkey Extension</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>');
    $(document.body).append(newBugzillaBugs);
    sideMenus.push(newBugzillaBugs);

    assignedBugzillaBugs = $('\
		<div data-pressgangtopic="24787" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Assigned Bugzilla Bugs</div>\
				<div class="panel-body ">\
		            <ul id="assignedBugzillaBugsItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); bugzillaBugs.show(); localStorage.setItem(\'lastMenu\', \'bugzillaBugs\');">&lt;- Bugzilla Bugs</a></li>\
						<li><a id="assignedBugzillaBugsPlaceholder" href="/PressZilla.user.js">This menu requires the PressZilla GreaseMonkey Extension</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>');
    $(document.body).append(assignedBugzillaBugs);
    sideMenus.push(assignedBugzillaBugs);

    postBugzillaBugs = $('\
		<div data-pressgangtopic="24787" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Post Bugzilla Bugs</div>\
				<div class="panel-body ">\
		            <ul id="postBugzillaBugsItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); bugzillaBugs.show(); localStorage.setItem(\'lastMenu\', \'bugzillaBugs\');">&lt;- Bugzilla Bugs</a></li>\
						<li><a id="postBugzillaBugsPlaceholder" href="/PressZilla.user.js">This menu requires the PressZilla GreaseMonkey Extension</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>');
    $(document.body).append(postBugzillaBugs);
    sideMenus.push(postBugzillaBugs);

    modifiedBugzillaBugs = $('\
		<div data-pressgangtopic="24787" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Modified Bugzilla Bugs</div>\
				<div class="panel-body ">\
		            <ul id="modifiedBugzillaBugsItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); bugzillaBugs.show(); localStorage.setItem(\'lastMenu\', \'bugzillaBugs\');">&lt;- Bugzilla Bugs</a></li>\
						<li><a id="modifiedBugzillaBugsPlaceholder" href="/PressZilla.user.js">This menu requires the PressZilla GreaseMonkey Extension</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>');
    $(document.body).append(modifiedBugzillaBugs);
    sideMenus.push(modifiedBugzillaBugs);

    onqaBugzillaBugs = $('\
		<div data-pressgangtopic="24787" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'On QA Bugzilla Bugs</div>\
				<div class="panel-body ">\
		            <ul id="onqaBugzillaBugsItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); bugzillaBugs.show(); localStorage.setItem(\'lastMenu\', \'bugzillaBugs\');">&lt;- Bugzilla Bugs</a></li>\
						<li><a id="onqaBugzillaBugsPlaceholder" href="/PressZilla.user.js">This menu requires the PressZilla GreaseMonkey Extension</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>');
    $(document.body).append(onqaBugzillaBugs);
    sideMenus.push(onqaBugzillaBugs);

    verifiedBugzillaBugs = $('\
		<div class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Verified Bugzilla Bugs</div>\
				<div class="panel-body ">\
		            <ul id="verifiedBugzillaBugsItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); bugzillaBugs.show(); localStorage.setItem(\'lastMenu\', \'bugzillaBugs\');">&lt;- Bugzilla Bugs</a></li>\
						<li><a id="verifiedBugzillaBugsPlaceholder" href="/PressZilla.user.js">This menu requires the PressZilla GreaseMonkey Extension</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>');
    $(document.body).append(verifiedBugzillaBugs);
    sideMenus.push(verifiedBugzillaBugs);

    closedBugzillaBugs = $('\
		<div data-pressgangtopic="24787" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Closed Bugzilla Bugs</div>\
				<div class="panel-body ">\
		            <ul id="closedBugzillaBugsItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); bugzillaBugs.show(); localStorage.setItem(\'lastMenu\', \'bugzillaBugs\');">&lt;- Bugzilla Bugs</a></li>\
						<li><a id="closedBugzillaBugsPlaceholder" href="/PressZilla.user.js">This menu requires the PressZilla GreaseMonkey Extension</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>');
    $(document.body).append(closedBugzillaBugs);
    sideMenus.push(closedBugzillaBugs);

    releasePendingBugzillaBugs = $('\
		<div data-pressgangtopic="24787" class="panel panel-default pressgangMenu">\
			<div class="panel-heading">' + help + 'Release Pending Bugzilla Bugs</div>\
				<div class="panel-body ">\
		            <ul id="releasePendingBugzillaBugsItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); bugzillaBugs.show(); localStorage.setItem(\'lastMenu\', \'bugzillaBugs\');">&lt;- Bugzilla Bugs</a></li>\
						<li><a id="releasePendingBugzillaBugsPlaceholder" href="/PressZilla.user.js">This menu requires the PressZilla GreaseMonkey Extension</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>');
    $(document.body).append(releasePendingBugzillaBugs);
    sideMenus.push(releasePendingBugzillaBugs);

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
    }else if (lastMenu == "postBugzillaBugs") {
        postBugzillaBugs.show();
        showMenu();
    }else if (lastMenu == "modifiedBugzillaBugs") {
        modifiedBugzillaBugs.show();
        showMenu();
    }else if (lastMenu == "onqaBugzillaBugs") {
        onqaBugzillaBugs.show();
        showMenu();
    }else if (lastMenu == "verifiedBugzillaBugs") {
        verifiedBugzillaBugs.show();
        showMenu();
    }else if (lastMenu == "closedBugzillaBugs") {
        closedBugzillaBugs.show();
        showMenu();
    }else if (lastMenu == "releasePendingBugzillaBugs") {
        releasePendingBugzillaBugs.show();
        showMenu();
    } else if (lastMenu == "topicsUpdatedInOtherSpecs") {
        topicsUpdatedInOtherSpecs.show();
        showMenu();
    } else if (lastMenu == "topReusedTopics") {
        topReusedTopics.show();
        showMenu();
    } else if (lastMenu == spellingErrors) {
        spellingErrors.show();
        showMenu();
    } else {
		menuIcon.show();
		hideMenu();
	}


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
