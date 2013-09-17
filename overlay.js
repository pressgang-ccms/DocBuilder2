// ==UserScript==
// @name          Docbuilder Overlay
// @namespace     https://skynet.usersys.redhat.com
// @include       http://docbuilder.usersys.redhat.com/*
// @require       http://code.jquery.com/jquery-2.0.3.min.js
// @require       https://rawgithub.com/moment/moment/2.2.1/min/moment.min.js
// ==/UserScript==

var MATCH_PREFIX = "cf_build_id=";
var MATCH_BUILD_ID = MATCH_PREFIX + "[0-9]+";
var SERVER = "http://topika.ecs.eng.bne.redhat.com:8080/pressgang-ccms/rest/1";
//var SERVER = "http://skynet-dev.usersys.redhat.com:8080/pressgang-ccms/rest/1";

findTopicIds();

function addOverlayIcons(topicId, RoleCreatePara) {
    if (topicId != null && topicId.length > 0) {
        var bubbleDiv = document.createElement("div");
        bubbleDiv.style.height = "42px";
        RoleCreatePara.parentNode.appendChild(bubbleDiv);
        createSpecsPopover(topicId, bubbleDiv);
        createHistoryPopover(topicId, bubbleDiv);
        createDescriptionPopover(topicId, bubbleDiv);
    }
}

function createSpecsPopover(topicId, parent) {
    var linkDiv = createIcon("book", topicId);
    parent.appendChild(linkDiv);

    var popover = createPopover("Content Specifications", topicId);
    document.body.appendChild(popover);

    linkDiv.onmouseover=function(){
        popover.style.left= linkDiv.parentNode.offsetLeft + 'px';
        popover.style.top= (linkDiv.offsetTop - 300) + 'px';
        popover.style.display = '';

        popover.popoverContent.innerHTML = 'Loading...';

        $.getJSON( SERVER + "/contentspecnodes/get/json/query;csNodeType=0%2C9%2C10;csNodeEntityId=" + topicId + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A+%22nodes%22%7D%2C+%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A+%22inheritedCondition%22%7D%7D%2C+%7B%22trunk%22%3A%7B%22name%22%3A+%22contentSpec%22%7D%2C+%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A+%22children_OTM%22%7D%7D%5D%7D%5D%7D%5D%7D",
            function(popover) {
                return function( data ) {
                    popover.popoverContent.innerHTML = '';
                    specs = {};
                    for (var specIndex = 0, specCount = data.items.length; specIndex < specCount; ++specIndex) {
                        var spec = data.items[specIndex].item.contentSpec;
                        if (!specs[spec.id]) {
                            var specDetails = {title: "", product: "", version: ""};
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
                        var link = document.createElement("div");
                        link.innerText = spec + " " + specs[spec].title + " " + specs[spec].product + " " + specs[spec].version
                        popover.popoverContent.appendChild(link);
                    }
                }
        }(popover));
    };
    linkDiv.onmouseout=function(){
        popover.style.display = 'none';
    };
}

function createHistoryPopover(topicId, parent) {
    var linkDiv = createIcon("history", topicId);
    parent.appendChild(linkDiv);

    var popover = createPopover("History", topicId);
    document.body.appendChild(popover);

    linkDiv.onmouseover=function(){
        popover.style.left= linkDiv.parentNode.offsetLeft + 'px';
        popover.style.top= (linkDiv.offsetTop - 300) + 'px';
        popover.style.display = '';

        popover.popoverContent.innerHTML = 'Loading...';

        $.getJSON( SERVER + "/topic/get/json/" + topicId + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22revisions%22%2C%20%22start%22%3A0%2C%20%22end%22%3A13%7D%2C%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22logDetails%22%7D%7D%5D%7D%5D%7D",
            function(popover) {
                return function( data ) {
                    popover.popoverContent.innerHTML = '';
                    specs = {};
                    for (var revisionIndex = 0, revisionCount = data.revisions.items.length; revisionIndex < revisionCount; ++revisionIndex) {
                        var revision = data.revisions.items[revisionIndex].item;
                        var link = document.createElement("div");

                        var message = revision.logDetails.message == null || revision.logDetails.message.length == 0 ? "[No Message]" : revision.logDetails.message;
                        var date = moment(revision.lastModified);

                        link.innerText = revision.revision + " - " + date.format('lll') + " - " + message;
                        popover.popoverContent.appendChild(link);
                    }
                }
            }(popover));
    };
    linkDiv.onmouseout=function(){
        popover.style.display = 'none';
    };
}

function createDescriptionPopover(topicId, parent) {
    var linkDiv = createIcon("info", topicId);
    parent.appendChild(linkDiv);

    var popover = createPopover("Description", topicId);
    document.body.appendChild(popover);

    linkDiv.onmouseover=function(){
        popover.style.left= linkDiv.parentNode.offsetLeft + 'px';
        popover.style.top= (linkDiv.offsetTop - 300) + 'px';
        popover.style.display = '';

        popover.popoverContent.innerHTML = 'Loading...';

        $.getJSON( SERVER + "/topic/get/json/" + topicId, function(popover) {
            return function( data ) {
                if (data.description.trim().length != 0) {
                    $(popover.popoverContent).text(data.description);
                } else {
                    $(popover.popoverContent).text("[No Description]");
                }
            }
        }(popover));
    };
    linkDiv.onmouseout=function(){
        popover.style.display = 'none';
    };
}

/*
 * Finds all the topic ids in a document and adds the topic id to the bottom of the title.
 */
function findTopicIds() {
    var elements = document.getElementsByTagName("div");
    for (var i = 0; i < elements.length; ++i) {
        var element = elements[i];
        if (element.className.match(".*RoleCreateBugPara.*")) {
            if (element.innerHTML.match(".*Report a bug.*")) {
                var startPos = element.innerHTML.search(MATCH_BUILD_ID);
                if (startPos != -1) {
                    var temp = element.innerHTML.substring(startPos + MATCH_PREFIX.length);
                    var endPos = temp.search("(?![0-9]+).*");
                    addOverlayIcons(temp.substring(0, endPos), element);
                }
            }
        }
    }
    return null;
}

function createIcon(img, topicId) {
    var linkDiv = document.createElement("div");
    linkDiv.setAttribute("id", topicId + img + "Icon");
    linkDiv.style.backgroundImage = "url(/images/" + img + ".png)";
    linkDiv.style.width = "26px";
    linkDiv.style.height = "26px";
    linkDiv.style.float = "left";
    linkDiv.style.backgroundRepeat = "no-repeat";
    linkDiv.style.margin = "8px";
    return linkDiv;
}

function createPopover(title, topicId) {
    var popover = document.createElement("div");
    popover.setAttribute("id", topicId + "title");
    popover.style.position="absolute";
    popover.style.height='300px';
    popover.style.width='450px';
    popover.style.display = 'none';
    popover.style.backgroundColor = 'white';
    popover.style.borderColor = 'blue';
    popover.style.borderWidth = '2px';
    popover.style.borderStyle = 'solid';

    var popoverTitle = document.createElement("div");
    popoverTitle.style.width = "442px";
    popoverTitle.style.paddingTop = "8px";
    popoverTitle.style.paddingBottom = "8px";
    popoverTitle.style.paddingLeft = "8px";
    popoverTitle.style.color = "white";
    popoverTitle.style.backgroundColor = "blue";
    popoverTitle.innerText = title;

    popover.appendChild(popoverTitle);

    var popoverContent = document.createElement("div");
    popoverContent.style.margin = "8px";
    popover.appendChild(popoverContent);

    popover.popoverContent = popoverContent;

    return popover;
}