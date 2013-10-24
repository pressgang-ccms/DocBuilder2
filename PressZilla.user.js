// ==UserScript==
// @name        PressZilla
// @namespace   https://www.jboss.org/pressgang
// @description PressGang BugZilla customization
// @author      Matthew Casperson
// @include     https://bugzilla.redhat.com/*
// @include     http://docbuilder.usersys.redhat.com/*
// @include     http://docbuilder.ecs.eng.bne.redhat.com/*
// @require     http://code.jquery.com/jquery-2.0.3.min.js
// @version     1.5
// @grant       GM_xmlhttpRequest
// @grant       unsafeWindow
// @downloadURL http://docbuilder.usersys.redhat.com/PressZilla.user.js
// @updateURL   http://docbuilder.usersys.redhat.com/PressZilla.meta.js
// @homepageURL http://docbuilder.usersys.redhat.com
// ==/UserScript==

var NEW_WINDOW_NAME = "PressZilla";
var run = false;
var solutionsCache = {};

function logToConsole(message) {
    console.log(message);
}

if (window.location.host == "docbuilder.usersys.redhat.com" || window.location.host == "docbuilder.ecs.eng.bne.redhat.com") {

    logToConsole("Detected DocBuilder Window");

    /*
        Here we add listeners for the opening of the various popovers that will be populated with
        data otherwise unavailable to the browser due to same origin rules.
     */

    function getSolutions(topic, position, topicId, popoverId) {
        logToConsole("Getting solutions");

        var keywords = "";
        for (var keywordIndex = 0, keywordCount = topic.keywords.length; keywordIndex < keywordCount; ++keywordIndex){
            if (keywords.length != 0) {
                if (keywordIndex / keywordCount * 100 < position) {
                    keywords += " AND ";
                } else {
                    keywords += " OR ";
                }
            }
            keywords += topic.keywords[keywordIndex];
        }

        logToConsole("querying solutions: " + keywords);

        var kcsUrl = "https://api.access.redhat.com/rs/solutions?limit=10&keyword=" + encodeURIComponent(keywords);

        var handleError = function() {
            var buttonId = popoverId + 'contentbutton';
            jQuery('#' + buttonId).attr('disabled', 'true');
            jQuery('#' + buttonId).text('Connection Failed');
            jQuery('#' + buttonId).removeClass('btn-primary');
            jQuery('#' + buttonId).addClass('btn-danger');
        }

        GM_xmlhttpRequest({
            method: 'GET',
            url: kcsUrl,
            headers: {Accept: 'application/json'},
            onabort: function() {logToConsole("onabort"); handleError();},
            onerror: function() {logToConsole("onerror"); handleError();},
            onprogress: function() {logToConsole("onprogress");},
            onreadystatechange: function() {logToConsole("onreadystatechange");},
            ontimeout: function() {logToConsole("ontimeout"); handleError();},
            onload: function(topicId, popoverId) {
                return function(solutionsResponse) {
                    logToConsole(solutionsResponse);

                    var content = jQuery('#' + popoverId + "content");
                    content.empty();

                    if (solutionsResponse.status == 401) {
                        content.append(jQuery("<div>The credentials you entered were incorrect. Please confirm that the username and password you entered are valid for the <a href='http://access.redhat.com'>Red Hat Customer Portal</a>.</div>"));
                        delete solutionsCache[topicId];
                    } else if (solutionsResponse.status == 200) {
                        var solutions = JSON.parse(solutionsResponse.responseText);

                        if (!solutions.solution) {
                            if (position > 0) {
                                getSolutions(topic, position - 25, topicId, popoverId);
                            }
                        } else {
                            var solutionsTable = "<ul>";

                            for (var solutionIndex = 0, solutionCount = solutions.solution.length; solutionIndex < solutionCount; ++solutionIndex) {
                                var solution = solutions.solution[solutionIndex];
                                var published = solution.moderation_state == "published";
                                solutionsTable += '<li><span style="min-width: 5em; display: inline-block;"><a style="color: ' + (published ? "#5cb85c" : "#d9534f") + '" href="' + solution.view_uri + '">[' + solution.id + ']</a></span><a href="' + solution.view_uri + '">' + solution.title + '</a></li>';
                            }

                            solutionsTable += "</ul>";

                            // keep a copy of the results
                            solutionsCache[topicId].text = solutionsTable;

                            content.append(jQuery(solutionsTable));
                        }
                    }
                }
            }(topicId, popoverId)
        });
    }

    function fetchKeywords(topicId, popoverId) {
        if (!solutionsCache[unsafeWindow.eventDetails.topicId].fetching) {

            logToConsole("Getting topic keywords");

            // make a note that we have started processing this topic
            solutionsCache[unsafeWindow.eventDetails.topicId].fetching = true;

            var handleError = function() {
                var buttonId = popoverId + 'contentbutton';
                jQuery('#' + buttonId).attr('disabled', 'true');
                jQuery('#' + buttonId).text('Connection Failed');
                jQuery('#' + buttonId).removeClass('btn-primary');
                jQuery('#' + buttonId).addClass('btn-danger');
            }

            var specId = unsafeWindow.getSpecIdFromURL();
            var specProductUrl = "http://topika.ecs.eng.bne.redhat.com:8080/pressgang-ccms/rest/1/contentspecnodes/get/json/query;csNodeType=7;contentSpecIds=" + specId + "?expand=" + encodeURIComponent("{\"branches\":[{\"trunk\":{\"name\": \"nodes\"}}]}");

            setTimeout(function(){
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: specProductUrl,
                    onabort: function() {logToConsole("onabort"); handleError(); },
                    onerror: function() {logToConsole("onerror"); handleError();},
                    onprogress: function() {logToConsole("onprogress");},
                    onreadystatechange: function() {logToConsole("onreadystatechange");},
                    ontimeout: function() {logToConsole("ontimeout"); handleError();},
                    onload: function(topicId, popoverId) {
                        return function(specNodesResponse) {
                            var nodes = JSON.parse(specNodesResponse.responseText);
                            var product = "";
                            for (var nodeIndex = 0, nodeCount = nodes.items.length; nodeIndex < nodeCount; ++nodeIndex) {
                                var node = nodes.items[nodeIndex].item;
                                if (node.title == "Product") {
                                    var product = node.additionalText;
                                    break;
                                }
                            }

                            var additionalKeywords = product.split(" ");

                            GM_xmlhttpRequest({
                                method: 'GET',
                                url: topicKeywordUrl,
                                onabort: function() {logToConsole("onabort"); handleError();},
                                onerror: function() {logToConsole("onerror"); handleError();},
                                onprogress: function() {logToConsole("onprogress");},
                                onreadystatechange: function() {logToConsole("onreadystatechange");},
                                ontimeout: function() {logToConsole("ontimeout"); handleError();},
                                onload: function(topicResponse) {
                                    var topic = JSON.parse(topicResponse.responseText);
                                    topic.keywords = additionalKeywords.concat(topic.keywords);
                                    getSolutions(topic, 100, topicId, popoverId, product);
                                }
                            });
                        }
                    }(unsafeWindow.eventDetails.topicId, unsafeWindow.eventDetails.popoverId)
                });
            }, 0);

            var topicKeywordUrl = "http://topika.ecs.eng.bne.redhat.com:8080/pressgang-ccms/rest/1/topic/get/json/" + unsafeWindow.eventDetails.topicId + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A+%22keywords%22%7D%7D%5D%7D"

            // see http://stackoverflow.com/questions/11007605/gm-xmlhttprequest-why-is-it-never-firing-the-onload-in-firefox
            // and http://wiki.greasespot.net/0.7.20080121.0_compatibility
            setTimeout(function(){

            }, 0);
        }
    }

    // listen for the kcs popover
    jQuery(window).bind("solutions_opened", function(event){
        if (!solutionsCache[unsafeWindow.eventDetails.topicId]) {

            solutionsCache[unsafeWindow.eventDetails.topicId] = {contentFixed: true};

            var content = jQuery('#' + unsafeWindow.eventDetails.popoverId + "content");
            content.empty();

            var buttonId = unsafeWindow.eventDetails.popoverId + 'contentbutton';

            content.append(jQuery('<div>This popover displays KCS solutions that match the keywords in the topic.</div>\
                <div>You may be prompted for a username and password. These credentials are the ones that you use to log into the <a href="http://access.redhat.com">Red Hat Customer Portal</a></div>\
                <div style="display:table-cell; text-align: center; vertical-align:middle; width: 746px;">\
                    <button id="' + buttonId + '" style="margin-top: 32px;" type="button" class="btn btn-primary">Get Solutions</button>\
                </div>'));

            jQuery('#' + buttonId).click(function() {
                jQuery('#' + buttonId).attr('disabled', 'true');
                jQuery('#' + buttonId).text('Getting Solutions');
                fetchKeywords(unsafeWindow.eventDetails.topicId, unsafeWindow.eventDetails.popoverId);
            });
        }
    });

    /*
        Build the callout that displays the bug submission link.
     */
    var height = 250;
    var width = 200;
    var smallHeight = 150;

    var callout = null;

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

    function buildBugCallout(top, left, text, parent) {

        var iframeSrc = null;

        var parentSection = parent.parentNode;
        while (parentSection && (parentSection.nodeName != "DIV" || parentSection.className != "section")) {
            parentSection = parentSection.parentNode;
        }


        if (parentSection && parentSection.nodeName == "DIV" && parentSection.className == "section") {
            var elements = parentSection.childNodes;
            for (var i = elements.length - 1; i >= 0; --i) {
                var element = elements[i];
                if (element.className.match(".*RoleCreateBugPara.*")) {
                    if (element.innerHTML.match(".*Report a bug.*")) {
                        iframeSrc = element.children[0].getAttribute("href");
                        break;
                    }
                }
            }
        }

        if (iframeSrc) {

            var bzURLRegex = /.*?(&|\?)comment=(.*?)(&|$)/;
            var match = bzURLRegex.exec(iframeSrc);
            iframeSrc = iframeSrc.replace("comment=" + match[2], "comment=" + encodeURIComponent("Selected Text: \"" + text + "\"\n\nBug Details: ") + "&short_desc==" + encodeURIComponent("PressZilla Bug"));

            logToConsole(iframeSrc);

            callout = jQuery('<div id="PressZillaCallout" style="position: absolute; top: ' + top + 'px; left: ' + left + 'px; height: ' + smallHeight + 'px; width: ' + width + 'px">\
                           <div id="PressZillaCalloutArrowBackground" style="height: 0; width: 0; border-right: 12px solid #ffffff; border-top: 12px dotted transparent; border-bottom: 12px dotted transparent; left: 0px; top: 0px; margin-top: 2px; z-index: 11; float: left">\
                                <div id="PressZillaCalloutArrowForeground" style="position: relative; left: -10px; top: -12px; height: 0; width: 0; border-right: 10px solid rgb(66, 139, 202); border-top: 10px dotted transparent; border-bottom: 10px dotted transparent; z-index: 10;">\
                                </div>\
                            </div>\
                            <div id="PressZillaCalloutContents" style="border: solid 5px rgb(66, 139, 202); position: relative; top: 1px; left: 0; z-index: 3; width: ' + width + 'px; height: ' + smallHeight + 'px; padding: 4px; margin: 0">\
                                <div id="PressZillaCalloutButtonContents" style="display:table-cell; text-align: center; vertical-align:middle; width: ' + (width - 18) + 'px; height: ' + (smallHeight - 18) + 'px">\
                                    <a id="PressZillaCalloutButton" href="javascript:void" style="text-decoration: none; background-color: rgb(66, 139, 202); border-bottom-left-radius: 5px; border-bottom-right-radius: 5px; border-top-left-radius: 5px; border-top-right-radius: 5px; color: rgb(255, 255, 255); font-family: \'Helvetica Neue\',Helvetica,Arial,sans-serif; font-size: 14px; line-height: 20px; list-style-image: none; list-style-position: outside; list-style-type: none; padding-bottom: 10px; padding-left: 15px; padding-right: 15px; padding-top: 10px; position: relative; text-decoration: none; -moz-box-sizing: border-box; -moz-text-blink: none; -moz-text-decoration-color: rgb(255, 255, 255); -moz-text-decoration-line: none; -moz-text-decoration-style: solid;">\
                                        Create Bug\
                                    </a>\
                                </div>\
                            </div>\
                        </div>');
            jQuery(document.body).append(callout);

            jQuery('#PressZillaCalloutButton').click(function(event) {

                var newwindow = window.open(iframeSrc, NEW_WINDOW_NAME, 'directories=0,titlebar=0,toolbar=0,location=0,status=0,menubar=0,scrollbars=no,resizable=no,height=480,width=640');
                newwindow.focus();
                removeCallout();
            });
        } else {
            callout = jQuery('<div id="PressZillaCallout" style="position: absolute; top: ' + top + 'px; left: ' + left + 'px; height: ' + height + 'px; width: ' + width + 'px">\
                       <div id="PressZillaCalloutArrowBackground" style="height: 0; width: 0; border-right: 12px solid #ffffff; border-top: 12px dotted transparent; border-bottom: 12px dotted transparent; left: 0px; top: 0px; margin-top: 2px; z-index: 11; float: left">\
                            <div id="PressZillaCalloutArrowForeground" style="position: relative; left: -10px; top: -12px; height: 0; width: 0; border-right: 10px solid rgb(66, 139, 202); border-top: 10px dotted transparent; border-bottom: 10px dotted transparent; z-index: 10;">\
                            </div>\
                        </div>\
                        <div id="PressZillaCalloutContents" style="border: solid 5px rgb(66, 139, 202); position: relative; top: 1px; left: 0; z-index: 3; width: ' + width + 'px; height: ' + height + 'px; padding: 4px; margin: 0">\
                            <div id="PressZillaCalloutButtonContents" style="display:table-cell; text-align: center; vertical-align:middle; width: ' + (width - 18) + 'px; height: ' + (height - 18) + 'px">\
                                The content selected does not have any bug information. This may be because you selected text in a boilerplate section of the document which was not supplied by PressGang, or because the content specification has not enabled bug links.\
                            </div>\
                        </div>\
                    </div>');
            jQuery(document.body).append(callout);
        }


    }

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

    jQuery(document).mouseup(function(e) {

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

            buildBugCallout(top, left, selectedText, selectionDetails.parent);
        }

        return;
    });

} else if (NEW_WINDOW_NAME == window.name) {

    logToConsole("Detected Bugzilla Window");

    //jQuery(document.body).css("display", "none");

    //jQuery(document).ready(function() {

    //jQuery(document.body).css("display", "");

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

        var hidden = jQuery('#Create>input[type=hidden]');

        var assignedTo = jQuery('#assigned_to');
        assignedTo.css("display", "none");

        var cfBuildId = jQuery('#cf_build_id');
        cfBuildId.css("display", "none");

        var cfEnvironment = jQuery('#cf_environment');
        cfEnvironment.css("display", "none");


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
        createForm.append(assignedTo);
        createForm.append(cfBuildId);
        createForm.append(cfEnvironment);
        createForm.append(hidden);
        createForm.find('#CommentCell').append(comment);
        createForm.find('#SubmittCell').append(commit);

        jQuery("body").empty();
        jQuery("body").css("background-image", "none");
        comment.attr("rows", 25);
        jQuery("body").append(createForm);

    } else if (window.location.pathname == "/show_bug.cgi") {
        // Viewing the submitted bug
        var regex = /.*?id=(\d+)/;
        var match = regex.exec(window.location.href);
        if (match) {
            var id = match[1];
            var link = jQuery('<a href="' + window.location.href + '">Bug ' + id + ' Created</a>');
            var close = jQuery('<button onclick="javascript:window.close()" type="button">Close Window</button>');

            var createForm = jQuery('\
                <form id="Create" class="enter_bug_form" onsubmit="return validateEnterBug(this)" enctype="multipart/form-data" action="post_bug.cgi" method="post" name="Create">\
                    <table>\
                        <tr>\
                            <td id="LinkCell">\
                            </td>\
                        </tr>\
                        <tr>\
                            <td id="CloseCell">\
                            </td>\
                        </tr>\
                    </table>\
                </form>'
            );

            jQuery("body").empty();
            jQuery("body").css("background-image", "none");

            jQuery("#LinkCell", createForm).append(link);
            jQuery("#CloseCell", createForm).append(close);
            jQuery("body").append(createForm);

        }
    } else if (jQuery("#bugzilla-body").length != 0) {
        // something else (maybe product selection)
        var bugzillaBody = jQuery("#bugzilla-body");
        jQuery("body").empty();
        jQuery("body").css("background-image", "none");
        jQuery("body").append(bugzillaBody);
    }
    //}
}