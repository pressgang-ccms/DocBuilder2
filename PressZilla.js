// ==UserScript==
// @name        PressZilla
// @namespace   https://www.jboss.org/pressgang
// @description PressGang BugZilla customization
// @include     https://bugzilla.redhat.com/*
// @include     http://docbuilder.usersys.redhat.com/*
// @require     http://code.jquery.com/jquery-2.0.3.min.js
// @version     1
// @grant       none
// ==/UserScript==

var NEW_WINDOW_NAME = "PressZilla";

function logToConsole(message) {
    console.log(message);
}

logToConsole("Starting PressZilla");

if (window.location.host == "docbuilder.usersys.redhat.com") {

    logToConsole("Detected DocBuilder Window");

    var height = 150;
    var width = 200;
    var CS_METADATA_NODE = 7;

    var BASE_SERVER =  "topika.ecs.eng.bne.redhat.com:8080";
    var SERVER = "http://" + BASE_SERVER + "/pressgang-ccms/rest/1";

    var callout = null;
    var processedSpecNodes = false;
    var haveBugDetails = false;
    var bzProduct = null;
    var bzComponent = null;
    var bzVersion = null;

    function getSpecIdFromURL() {
        var urlComponents = window.location.href.split("/");
        for (var index = urlComponents.length - 1; index >= 0; --index) {
            var integer = parseInt(urlComponents[index]);
            if (!isNaN(integer)) {
                return integer;
            }
        }

        return null;
    }

    function buildBugCallout(top, left, text) {

        callout = jQuery('<div id="PressZillaCallout" style="position: absolute; top: ' + top + 'px; left: ' + left + 'px; height: ' + height + 'px; width: ' + width + 'px">\
                   <div id="PressZillaCalloutArrowBackground" style="height: 0; width: 0; border-right: 12px solid #ffffff; border-top: 12px dotted transparent; border-bottom: 12px dotted transparent; left: 0px; top: 0px; margin-top: 2px; z-index: 11; float: left">\
                        <div id="PressZillaCalloutArrowForeground" style="position: relative; left: -10px; top: -12px; height: 0; width: 0; border-right: 10px solid rgb(66, 139, 202); border-top: 10px dotted transparent; border-bottom: 10px dotted transparent; z-index: 10;">\
                        </div>\
                    </div>\
                    <div id="PressZillaCalloutContents" style="border: solid 5px rgb(66, 139, 202); position: relative; top: 1px; left: 0; z-index: 3; width: ' + width + 'px; height: ' + height + 'px; padding: 4px; margin: 0">\
                        <div id="PressZillaCalloutButtonContents" style="display:table-cell; text-align: center; vertical-align:middle; width: ' + width + 'px; height: ' + height + 'px">\
                            <a id="PressZillaCalloutButton" href="javascript:void" style="text-decoration: none; background-color: rgb(66, 139, 202); border-bottom-left-radius: 5px; border-bottom-right-radius: 5px; border-top-left-radius: 5px; border-top-right-radius: 5px; color: rgb(255, 255, 255); font-family: \'Helvetica Neue\',Helvetica,Arial,sans-serif; font-size: 14px; line-height: 20px; list-style-image: none; list-style-position: outside; list-style-type: none; padding-bottom: 10px; padding-left: 15px; padding-right: 15px; padding-top: 10px; position: relative; text-decoration: none; -moz-box-sizing: border-box; -moz-text-blink: none; -moz-text-decoration-color: rgb(255, 255, 255); -moz-text-decoration-line: none; -moz-text-decoration-style: solid;">\
                                Create Bug\
                            </a>\
                        </div>\
                    </div>\
                </div>');
        jQuery(document.body).append(callout);
        jQuery('#PressZillaCalloutButton').click(function(event) {
            var iframeSrc = "https://bugzilla.redhat.com/enter_bug.cgi?product=" + encodeURIComponent(bzProduct) +
                "&component=" + encodeURIComponent(bzComponent) +
                "&version=" + encodeURIComponent(bzVersion) +
                "&short_desc=PressZilla%20Bug" +
                "&comment=" + encodeURIComponent("Selected Text: \"" + text + "\"");
            var newwindow = window.open(iframeSrc, NEW_WINDOW_NAME, 'directories=0,titlebar=0,toolbar=0,location=0,status=0,menubar=0,scrollbars=no,resizable=no,height=240,width=640');
            newwindow.focus();
            removeCallout();
        });
    }

    function buildMissingDetauilsCallout(top, left) {
        callout = jQuery('<div id="PressZillaCallout" style="position: absolute; top: ' + top + 'px; left: ' + left + 'px; height: ' + height + 'px; width: ' + width + 'px">\
                   <div id="PressZillaCalloutArrowBackground" style="height: 0; width: 0; border-right: 12px solid #ffffff; border-top: 12px dotted transparent; border-bottom: 12px dotted transparent; left: 0px; top: 0px; margin-top: 2px; z-index: 11; float: left">\
                        <div id="PressZillaCalloutArrowForeground" style="position: relative; left: -10px; top: -12px; height: 0; width: 0; border-right: 10px solid rgb(66, 139, 202); border-top: 10px dotted transparent; border-bottom: 10px dotted transparent; z-index: 10;">\
                        </div>\
                    </div>\
                    <div id="PressZillaCalloutContents" style="border: solid 5px rgb(66, 139, 202); position: relative; top: 1px; left: 0; z-index: 3; width: ' + width + 'px; height: ' + height + 'px; padding: 4px; margin: 0">\
                        <div id="PressZillaCalloutButtonContents" style="display:table-cell; text-align: center; vertical-align:middle; width: ' + width + 'px; height: ' + height + 'px">\
                            This content specification does not have the required metadata associated with it. The BZProduct, BZComponent and BZVersion metadata fields all need to be specified.\
                        </div>\
                    </div>\
                </div>');
        jQuery(document.body).append(callout);
    }

    var specId = getSpecIdFromURL();
    jQuery.getJSON(SERVER + "/contentspecnodes/get/json/query;csNodeType=" + CS_METADATA_NODE + ";contentSpecIds=" + specId + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22nodes%22%7D%7D%5D%7D", function(data) {
        for (var itemIndex = 0, itemCount = data.items.length; itemIndex < itemCount; ++itemIndex) {
            var csNode = data.items[itemIndex].item;
            if (csNode.title == "BZProduct") {
                bzProduct = csNode.additionalText;
            } else if (csNode.title == "BZComponent") {
                bzComponent = csNode.additionalText;
            } else if (csNode.title == "BZVersion") {
                bzVersion = csNode.additionalText;
            }
        }

        processedSpecNodes = true;
        haveBugDetails = bzProduct && bzComponent && bzVersion;

        if (callout) {
            callout.remove();
            if (haveBugDetails) {
                buildBugCallout();
            } else {
                buildMissingDetauilsCallout();
            }
        }
    });

    function removeCallout() {
        if (callout) {
            callout.remove();
            callout = null;
        }
    }

    // http://stackoverflow.com/questions/1335252/how-can-i-get-the-dom-element-which-contains-the-current-selection
    function getSelectionBoundaryElement(isStart) {
        var range, sel, container;
        if (document.selection) {
            range = document.selection.createRange();
            range.collapse(isStart);
            return {parent: range.parentElement(), selection: range};
        } else {
            sel = window.getSelection();
            if (sel.getRangeAt) {
                if (sel.rangeCount > 0) {
                    range = sel.getRangeAt(0);
                }
            } else {
                // Old WebKit
                range = document.createRange();
                range.setStart(sel.anchorNode, sel.anchorOffset);
                range.setEnd(sel.focusNode, sel.focusOffset);

                // Handle the case when the selection was selected backwards (from the end to the start in the document)
                if (range.collapsed !== sel.isCollapsed) {
                    range.setStart(sel.focusNode, sel.focusOffset);
                    range.setEnd(sel.anchorNode, sel.anchorOffset);
                }
            }

            if (range) {
                container = range[isStart ? "startContainer" : "endContainer"];

                // Check if the container is a text node and return its parent if so
                return {parent: container.nodeType === 3 ? container.parentNode : container, selection: sel};
            }
        }
    }

    jQuery(document.body).mouseup(function(e) {

        if (callout) {
            var x = e.pageX;
            var y = e.pageY;
            var offset = callout.offset();

            if (x >= offset.left && x <= offset.left + callout.width() &&
                y >= offset.top && y <= offset.top + callout.height()) {
                // click was over callout, so don't do anything
                logToConsole("Clicked over callout");
                return;
            }
        }

        removeCallout();
        var selectionDetails = getSelectionBoundaryElement(true);
        if (selectionDetails && selectionDetails.selection && jQuery.trim(selectionDetails.selection.toString()).length != 0) {

            var selectedText = jQuery.trim(selectionDetails.selection.toString());
            var top = jQuery(selectionDetails.parent).offset().top;
            var left = jQuery(document.body).offset().left + jQuery(document.body).width() + 20;

            logToConsole(selectedText);

            if (!processedSpecNodes) {
                callout = jQuery('<div id="PressZillaCallout" style="position: absolute; top: ' + top + 'px; left: ' + left + 'px; height: ' + height + 'px; width: ' + width + 'px">\
                   <div id="PressZillaCalloutArrowBackground" style="height: 0; width: 0; border-right: 12px solid #ffffff; border-top: 12px dotted transparent; border-bottom: 12px dotted transparent; left: 0px; top: 0px; margin-top: 2px; z-index: 11; float: left">\
                        <div id="PressZillaCalloutArrowForeground" style="position: relative; left: -10px; top: -12px; height: 0; width: 0; border-right: 10px solid rgb(66, 139, 202); border-top: 10px dotted transparent; border-bottom: 10px dotted transparent; z-index: 10;">\
                        </div>\
                    </div>\
                    <div id="PressZillaCalloutContents" style="border: solid 5px rgb(66, 139, 202); position: relative; top: 1px; left: 0; z-index: 3; width: ' + width + 'px; height: ' + height + 'px; padding: 4px; margin: 0">\
                        <div id="PressZillaCalloutButtonContents" style="display:table-cell; text-align: center; vertical-align:middle; width: ' + width + 'px; height: ' + height + 'px">\
                            Loading Spec Bug Details. Please Wait.\
                        </div>\
                    </div>\
                </div>');
            } else if (haveBugDetails) {
                buildBugCallout(top, left, selectedText);
            } else {
                buildMissingDetauilsCallout(top, left);
            }
        }

        return;
    });

} else if (NEW_WINDOW_NAME == window.name) {

    logToConsole("Detected Bugzilla Window");

    if (jQuery("#Bugzilla_login").length != 0) {
        // logging in

        var hiddenElements = jQuery("form>input[type=hidden]");

        var newForm = jQuery('<form method="POST" action="enter_bug.cgi" name="login">');
        var newFormInputs = jQuery('\
            <table>\
                <tbody>\
                    <tr>\
                        <th align="right">\
                            <label for="Bugzilla_login">\
                                Login:\
                            </label>\
                        </th>\
                        <td>\
                            <input id="Bugzilla_login" name="Bugzilla_login" size="35"></input>\
                        </td>\
                    </tr>\
                    <tr>\
                        <th align="right">\
                            <label for="Bugzilla_password">\
                                Password:\
                            </label>\
                        </th>\
                        <td>\
                            <input id="Bugzilla_password" type="password" name="Bugzilla_password" size="35"></input>\
                        </td>\
                    </tr>\
                </tbody>\
            </table>\
            <input id="log_in" type="submit" value="Log in" name="GoAheadAndLogIn"></input>');

        newFormInputs.append(hiddenElements);
        newForm.append(newFormInputs);

        jQuery("body").empty();
        jQuery("body").css("background-image", "none");
        jQuery("body").append(newForm);
    } else if (jQuery("#Create").length != 0) {
        // creating a bug
        var componentSelect = jQuery('#component');
        componentSelect.css("display", "none");
        var versionSelect = jQuery('#version');
        versionSelect.css("display", "none");
        var shortDesc = jQuery('#short_desc');
        shortDesc.css("display", "none");
        var comment = jQuery('#comment');
        var commit = jQuery('#commit');

        var createForm = jQuery('\
            <form id="Create" class="enter_bug_form" onsubmit="return validateEnterBug(this)" enctype="multipart/form-data" action="post_bug.cgi" method="post" name="Create">\
                <table>\
                    <tr>\
                        <td id="CommentCell">\
                        </td>\
                    </tr>\
                    <tr>\
                        <td id="SubmittCell">\
                        </td>\
                    </tr>\
                </table>\
            </form>'
        );

        createForm.append(componentSelect);
        createForm.append(versionSelect);
        createForm.append(shortDesc);
        createForm.find('#CommentCell').append(comment);
        createForm.find('#SubmittCell').append(commit);

        jQuery("body").empty();
        jQuery("body").css("background-image", "none");
        jQuery("body").append(createForm);

    } else if (window.location.pathname == "/show_bug.cgi") {
        // Viewing the submitted bug
        var regex = /.*?id=(\d+)/;
        var match = regex.exec(window.location.href);
        if (match) {
            var id = match[1];
            var link = jQuery('<a href="' + window.location.href + '">Bug ' + id + ' Created</a>');
            var close = jQuery('<button onclick="javascript:window.close()" type="button">Close Window</button>');

            jQuery("body").empty();
            jQuery("body").css("background-image", "none");
            jQuery("body").append(link);
            jQuery("body").append(close);
        }
    } else if (jQuery("#bugzilla-body").length != 0) {
        // something else (maybe product selection)
        var bugzillaBody = jQuery("#bugzilla-body");
        jQuery("body").empty();
        jQuery("body").css("background-image", "none");
        jQuery("body").append(bugzillaBody);
    }
}