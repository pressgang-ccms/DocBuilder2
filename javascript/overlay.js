// ==UserScript==
// @name          Docbuilder Overlay
// @namespace     https://skynet.usersys.redhat.com
// @include       http://docbuilder.usersys.redhat.com/*
// @require       http://code.jquery.com/jquery-2.0.3.min.js
// @require       https://rawgithub.com/moment/moment/2.2.1/min/moment.min.js
// ==/UserScript==

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
 * The server that hosts the UI we want to connect to.
 * @type {string}
 */
var SERVER = "http://topika.ecs.eng.bne.redhat.com:8080/pressgang-ccms/rest/1";
//var SERVER = "http://skynet-dev.usersys.redhat.com:8080/pressgang-ccms/rest/1";

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
 * A mapping of topic IDs to the section elements
 * @type {{}}
 */
var topicSections = {};

var topicsFound = false;
var secondPassTimeout = false;
var windowLoaded = false;
var secondPassCalled = false;

var secondPassRESTCalls = 0;
var secondPassRESTCallsCompleted = 0;

/*
	When the page is loaded, start looking for the links that indicate the topics.
 */
$(document).ready(function() {
	findTopicIds();
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
    }
}

/**
 * Creates the popuver that lists the specs the topic is included in.
 * @param topicId The topic id
 * @param parent The element that should hold the icon
 */
function createSpecsPopover(topicId, parent) {
    var linkDiv = createIcon("book", topicId);
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

						updateCount(linkDiv, specCache[topicId].data.length);
						renderSpecs(topicId);

					}
			}(popover));
		} else {
			renderSpecs(topicId);
		}
    };

    setupEvents(linkDiv, popover);
}

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
    var linkDiv = createIcon("tags", topicId);
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
							tagsCache[topicId].data.push({name: data.tags.items[tagIndex].item.name});
						}
						updateCount(linkDiv, tagsCache[topicId].data.length);
						renderTags(topicId);
					}
				}(popover));
		} else {
			renderTags(topicId);
		}
    };

    setupEvents(linkDiv, popover);
}

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
    var linkDiv = createIcon("urls", topicId);
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

						updateCount(linkDiv, urlCache[topicId].data.length);
						renderUrls(topicId);
					}
				}(popover));
		} else {
			renderUrls(topicId);
		}
    };

    setupEvents(linkDiv, popover);
}

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
    var linkDiv = createIcon("history", topicId);
    parent.appendChild(linkDiv);

    var popover = createPopover("History", topicId);
    document.body.appendChild(popover);

	var legend = $("<div style='padding-left: 8px; padding-right:8px; width: 742px; height: 42px; color: white; background-color: blue; display: table-cell; vertical-align: middle; font-weight: bold'><div style='float:left'>History. Last revision edited in&nbsp;</div>\
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
						updateCount(linkDiv, historyCache[topicId].data.length);
					}
				}(popover));
		} else {
			renderHistory(topicId);
		}
    };

    setupEvents(linkDiv, popover);
}

function renderHistory(topicId) {
	historyCache[topicId].popover.popoverContent.innerHTML = '';

	for (var revisionIndex = 0, revisionCount = historyCache[topicId].data.length; revisionIndex < revisionCount; ++revisionIndex) {
		var revision = historyCache[topicId].data[revisionIndex];
		var link = document.createElement("div");

		var message = revision.message == null || revision.message.length == 0 ? "[No Message]" : revision.message;
		var date = moment(revision.lastModified);

		$(link).text(revision.revision + " - " + date.format('lll') + " - " + message);
		historyCache[topicId].popover.popoverContent.appendChild(link);
	}
}

function updateHistoryIcon(topicId, title) {
	var icon = $("#" + topicId + "historyIcon");
	var date = moment(historyCache[topicId].data[0].lastModified);

	if (date.isAfter(moment().subtract('day', 1))) {
		icon.css('background-image', 'url(/images/history-blue.png)');
		$('<li><a href="javascript:topicSections[' + topicId + '].scrollIntoView()">' + title + '</a></li>').appendTo($("#topicsEditedIn1DayItems"));
	} else if (date.isAfter(moment().subtract('week', 1))) {
		icon.css('background-image', 'url(/images/history-green.png)');
		$('<li><a href="javascript:topicSections[' + topicId + '].scrollIntoView()">' + title + '</a></li>').appendTo($("#topicsEditedIn1WeekItems"));
	} else if (date.isAfter(moment().subtract('month', 1))) {
		icon.css('background-image', 'url(/images/history-yellow.png)');
		$('<li><a href="javascript:topicSections[' + topicId + '].scrollIntoView()">' + title + '</a></li>').appendTo($("#topicsEditedIn1MonthItems"));
	} else if (date.isAfter(moment().subtract('year', 1))) {
		icon.css('background-image', 'url(/images/history-orange.png)');
		$('<li><a href="javascript:topicSections[' + topicId + '].scrollIntoView()">' + title + '</a></li>').appendTo($("#topicsEditedIn1YearItems"));
	} else {
		icon.css('background-image', 'url(/images/history-red.png)');
		$('<li><a href="javascript:topicSections[' + topicId + '].scrollIntoView()">' + title + '</a></li>').appendTo($("#topicsEditedInOlderThanYearItems"));
	}
}

/**
 * Create the popover that displays the topic's description
 * @param topicId The topic id
 * @param parent The icon
 */
function createDescriptionPopover(topicId, parent) {
    var linkDiv = createIcon("info", topicId);
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
            }, 200);
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
            }, 200);
        }
    }(popover);
}

/*
 * Finds all the topic ids in a document and adds the topic id to the bottom of the title.
 */
function findTopicIds() {
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
function createIcon(img, topicId) {
    var linkDiv = document.createElement("div");
    linkDiv.setAttribute("id", topicId + img + "Icon");
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

    return linkDiv;
}

function updateCount(linkDiv, count) {
	if (count >= 1 && count <= 10) {
		linkDiv.countMarker.style.backgroundImage = "url(/images/" + count + ".png)";
	} else if (count > 10) {
		linkDiv.countMarker.style.backgroundImage = "url(/images/10plus.png)";
	} else {
		linkDiv.countMarker.style.backgroundImage = null;
	}
}

/**
 * Create the popover element
 * @param title The title of the popover
 * @param topicId The topic's ID
 * @returns The popover element
 */
function createPopover(title, topicId) {
    var popover = document.createElement("div");
    popover.setAttribute("id", topicId + title + "title");
    popover.style.position="absolute";
    popover.style.height='300px';
    popover.style.width='750px';
    popover.style.display = 'none';
    popover.style.backgroundColor = 'white';
    popover.style.borderColor = 'blue';
    popover.style.borderWidth = '2px';
    popover.style.borderStyle = 'solid';

    var popoverTitle = document.createElement("div");
    popoverTitle.style.width = "742px";
    popoverTitle.style.height = "42px";
    popoverTitle.style.paddingLeft = "8px";
    popoverTitle.style.color = "white";
    popoverTitle.style.backgroundColor = "blue";
    popoverTitle.style.fontWeight = "bold";
    popoverTitle.style.display = "table-cell";
    popoverTitle.style.verticalAlign = "middle";
    $(popoverTitle).text(title);

	popover.popoverTitle = popoverTitle;

    popover.appendChild(popoverTitle);

    var popoverContent = document.createElement("div");
	popoverContent.style.clear = "both";
	popoverContent.style.margin = "8px";
    popoverContent.style.height = "242px";
    popoverContent.style.overflowY = "auto";
	$(popoverContent).text('Loading...');
    popover.appendChild(popoverContent);

    popover.popoverContent = popoverContent;

    return popover;
}

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
		var topicIdsString = "";
		var delay = SECOND_PASS_REST_CALL_DELAY;
		for (var index = 0, count = topicIds.length; index < count; ++index) {
			if (topicIdsString.length != 0) {
				topicIdsString += ",";
			}

			topicIdsString += topicIds[index];

			if (index != 0 && index % 15 == 0) {
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

		if (topicIdsString.length != 0) {
			++secondPassRESTCalls;
			setTimeout(function(topicIdsString) {
				return function() {
					doSecondPassQuery(topicIdsString);
				}
			}(topicIdsString), delay);
		}
	}
}

function doSecondPassQuery(topicIdsString) {
	$.getJSON(BACKGROUND_QUERY_PREFIX + topicIdsString + BACKGROUND_QUERY_POSTFIX, function (data, textStatus, jqXHR) {
		++secondPassRESTCallsCompleted;
		if (data && data.items) {
			for (var topicIndex = 0, topicCount = data.items.length; topicIndex < topicCount; ++topicIndex) {
				var topic = data.items[topicIndex].item;

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
					tagsCache[topic.id].data.push({name: tag.name});
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

				updateCount($("#" + topic.id + "historyIcon")[0], historyCache[topic.id].data.length);
				updateCount($("#" + topic.id + "urlsIcon")[0], urlCache[topic.id].data.length);
				updateCount($("#" + topic.id + "tagsIcon")[0], tagsCache[topic.id].data.length);
				updateCount($("#" + topic.id + "bookIcon")[0], specCache[topic.id].data.length);
			}
		} else {
			console.log("Bad request");
		}

		// Call some functions when all the data is availble.
		if (secondPassRESTCallsCompleted == secondPassRESTCalls) {
			console.log("Second pass completed");
			buildTopicEditedInChart();
		}
	});
}

function hideAllMenus() {
	menuIcon.hide();
	mainMenu.hide();
	topicsByLastEdit.hide();
	topicsEditedIn1Day.hide();
	topicsEditedIn1Week.hide();
	topicsEditedIn1Month.hide();
	topicsEditedIn1Year.hide();
	topicsEditedInOlderThanYear.hide();
}

function buildTopicEditedInChart() {

	historyCache.summary = {};
	historyCache.summary.day = 0;
	historyCache.summary.week = 0;
	historyCache.summary.month = 0;
	historyCache.summary.year = 0;
	historyCache.summary.older = 0;
	historyCache.summary.count = topicIds.length;

	for (var index = 0; index < historyCache.summary.count; ++index) {
		var topic = historyCache[topicIds[index]].data[0];
		var date = moment(topic.lastModified);

		if (date.isAfter(moment().subtract('day', 1))) {
			++historyCache.summary.day;
		} else if (date.isAfter(moment().subtract('week', 1))) {
			++historyCache.summary.week;
		} else if (date.isAfter(moment().subtract('month', 1))) {
			++historyCache.summary.month;
		} else if (date.isAfter(moment().subtract('year', 1))) {
			++historyCache.summary.year;
		} else {
			++historyCache.summary.older;
		}
	}

	$('#topicsEditedIn1Day').append($('<span class="badge pull-right">' + historyCache.summary.day + '</span>'));
	$('#topicsEditedIn1Week').append($('<span class="badge pull-right">' + historyCache.summary.week + '</span>'));
	$('#topicsEditedIn1Month').append($('<span class="badge pull-right">' + historyCache.summary.month + '</span>'));
	$('#topicsEditedIn1Year').append($('<span class="badge pull-right">' + historyCache.summary.year + '</span>'));
	$('#topicsEditedInOlderThanYear').append($('<span class="badge pull-right">' + historyCache.summary.older + '</span>'));


	var chart = $('<div id="topicEditedInChart"></div>');
	chart.appendTo($("#topicsEditedInPanel"));

	var values = [
		historyCache.summary.day / historyCache.summary.count * 100.0,
		historyCache.summary.week / historyCache.summary.count * 100.0,
		historyCache.summary.month / historyCache.summary.count * 100.0,
		historyCache.summary.year / historyCache.summary.count * 100.0,
		historyCache.summary.older / historyCache.summary.count * 100.0];

	var labels = ["day", "week", "month", "year", "older"];
	var colors = [Raphael.rgb(0, 254, 254), Raphael.rgb(0, 254, 0), Raphael.rgb(254, 254, 0), Raphael.rgb(254, 127, 0), Raphael.rgb(254, 0, 0)];

	Raphael("topicEditedInChart", 250, 250).pieChart(125, 125, 50, values, labels, colors, 10, 10, 16, "#fff");
}

function showMenu() {
	document.body.style.margin = "0 auto auto 350px";
}

function hideMenu() {
	document.body.style.margin = "0 auto";
}

function buildMenu() {
	menuIcon = $('<div onclick="hideAllMenus(); mainMenu.show(); showMenu(); localStorage.setItem(\'lastMenu\', \'mainMenu\');" style="cursor: pointer; position: fixed; top: 8px; left: 8px; width: 64px; height: 64px; background-image: url(/images/pressgang.svg); background-size: contain"></div>')
	$(document.body).append(menuIcon);

	mainMenu = $('\
		<div class="panel panel-default pressgangMenu">\
			<div class="panel-heading">PressGang</div>\
				<div class="panel-body ">\
		            <ul class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); hideMenu(); menuIcon.show(); localStorage.setItem(\'lastMenu\', \'menuIcon\');">Hide Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); topicsByLastEdit.show(); localStorage.setItem(\'lastMenu\', \'topicsByLastEdit\');">Topics By Last Edit</a></li>\
						<li><a href="#">Topics Added Since</a></li>\
						<li><a href="#">Topics Removed Since</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
	$(document.body).append(mainMenu);

	topicsByLastEdit = $('\
		<div class="panel panel-default pressgangMenu">\
			<div class="panel-heading">Topics By Last Edit</div>\
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

	topicsEditedIn1Day = $('\
		<div class="panel panel-default pressgangMenu">\
			<div class="panel-heading">Topics Edited In 1 Day</div>\
				<div class="panel-body ">\
		            <ul id="topicsEditedIn1DayItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); topicsByLastEdit.show(); localStorage.setItem(\'lastMenu\', \'topicsByLastEdit\');">&lt;- Topics By Last Edit</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
	$(document.body).append(topicsEditedIn1Day);

	topicsEditedIn1Week = $('\
		<div class="panel panel-default pressgangMenu">\
			<div class="panel-heading">Topics Edited In 1 Week</div>\
				<div class="panel-body ">\
		            <ul id="topicsEditedIn1WeekItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); topicsByLastEdit.show(); localStorage.setItem(\'lastMenu\', \'topicsByLastEdit\');">&lt;- Topics By Last Edit</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
	$(document.body).append(topicsEditedIn1Week);

	topicsEditedIn1Month = $('\
		<div class="panel panel-default pressgangMenu">\
			<div class="panel-heading">Topics Edited In 1 Month</div>\
				<div class="panel-body ">\
		            <ul id="topicsEditedIn1MonthItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); topicsByLastEdit.show(); localStorage.setItem(\'lastMenu\', \'topicsByLastEdit\');">&lt;- Topics By Last Edit</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
	$(document.body).append(topicsEditedIn1Month);

	topicsEditedIn1Year = $('\
		<div class="panel panel-default pressgangMenu">\
			<div class="panel-heading">Topics Edited In 1 Year</div>\
				<div class="panel-body ">\
		            <ul id="topicsEditedIn1YearItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); topicsByLastEdit.show(); localStorage.setItem(\'lastMenu\', \'topicsByLastEdit\');">&lt;- Topics By Last Edit</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
	$(document.body).append(topicsEditedIn1Year);


	topicsEditedInOlderThanYear = $('\
		<div class="panel panel-default pressgangMenu">\
			<div class="panel-heading">Topics Edited Prior To 1 Year</div>\
				<div class="panel-body ">\
		            <ul id="topicsEditedInOlderThanYearItems" class="nav nav-pills nav-stacked">\
						<li><a href="javascript:hideAllMenus(); mainMenu.show(); localStorage.setItem(\'lastMenu\', \'mainMenu\');">&lt;- Main Menu</a></li>\
						<li><a href="javascript:hideAllMenus(); topicsByLastEdit.show(); localStorage.setItem(\'lastMenu\', \'topicsByLastEdit\');">&lt;- Topics By Last Edit</a></li>\
					</ul>\
				</div>\
			</div>\
		</div>')
	$(document.body).append(topicsEditedInOlderThanYear);

	hideAllMenus();

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
	} else {
		menuIcon.show();
		hideMenu();
	}


}