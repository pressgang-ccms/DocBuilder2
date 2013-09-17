// ==UserScript==
// @name          Docbuilder Overlay
// @namespace     https://skynet.usersys.redhat.com
// @include       http://docbuilder.usersys.redhat.com/*
// @require       http://code.jquery.com/jquery-2.0.3.min.js
// ==/UserScript==

var MATCH_PREFIX = "cf_build_id=";
var MATCH_BUILD_ID = MATCH_PREFIX + "[0-9]+";
var SERVER = "http://topika.ecs.eng.bne.redhat.com:8080/pressgang-ccms/rest/1";
//var SERVER = "http://skynet-dev.usersys.redhat.com:8080/pressgang-ccms/rest/1";

findTopicIds();

/*
 * Alters the Edit URL to point to the new PressGang GUI
 */
function addOverlayIcons(topicId, RoleCreatePara) {
    if (topicId != null && topicId.length > 0) {
        var linkDiv = document.createElement("div");
        var icon = document.createElement("img");
        icon.setAttribute("id", topicId + "descriptionIcon");
        icon.setAttribute("src", "/images/info.png");

        linkDiv.appendChild(icon);
        RoleCreatePara.parentNode.appendChild(linkDiv);

        setTimeout(function(icon, topicId) {
            return function() {
                var popover = createPopover("Description", topicId);
                document.body.appendChild(popover);

                icon.onmouseover=function(){
                    popover.style.left= icon.parentNode.offsetLeft + 'px';
                    popover.style.top= (icon.offsetTop - 300) + 'px';
                    popover.style.display = '';

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
                icon.onmouseout=function(){
                    popover.style.display = 'none';
                };
            }
        } (icon, topicId), 0);
    }
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