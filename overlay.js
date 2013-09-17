// ==UserScript==
// @name          Docbuilder Overlay
// @namespace     https://skynet.usersys.redhat.com
// @include       http://docbuilder.usersys.redhat.com/*
// ==/UserScript==

var MATCH_PREFIX = "cf_build_id=";
var MATCH_BUILD_ID = MATCH_PREFIX + "[0-9]+";

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

        setTimeout(function(icon) {
            return function() {
                var popover = document.createElement("div");
                popover.setAttribute("id", topicId + "popover");
                popover.style.position="absolute";
                popover.style.height='300px';
                popover.style.width='450px';
                popover.style.display = 'none';
                popover.style.backgroundColor = 'red';
                document.body.appendChild(popover);

                icon.onmouseover=function(){
                    popover.style.left= icon.parentNode.offsetLeft + 'px';
                    popover.style.top= (icon.offsetTop - 300) + 'px';
                    popover.style.display = '';
                };
                icon.onmouseout=function(){
                    popover.style.display = 'none';
                };
            }
        } (icon), 0);
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

function cumulativeOffset(element) {
    var top = 0, left = 0;
    do {
        top += element.offsetTop  || 0;
        left += element.offsetLeft || 0;
        element = element.offsetParent;
    } while(element);

    return {
        top: top,
        left: left
    };
};