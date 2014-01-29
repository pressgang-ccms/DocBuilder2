/*
    This file contains the logic for integrating with Bugzilla.
 */
(function() {
    /**
     * The name of the popup window containing Bugzilla
     * @type {string}
     */
    var NEW_WINDOW_NAME = "PressZilla";

    if (isDocbuilderWindow() || isDocStageWindow()) {
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
                iframeSrc = iframeSrc.replace("comment=" + match[2], "comment=" + encodeURIComponent("Selected Text: \"" + text + "\"\n\nBug Details: ") + "&short_desc=" + encodeURIComponent("PressZilla Bug"));

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
                                <td id="TitleCell">\
                                </td>\
                            </tr>\
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
            createForm.append(assignedTo);
            createForm.append(cfBuildId);
            createForm.append(cfEnvironment);
            createForm.append(hidden);
            createForm.find('#TitleCell').append(shortDesc);
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
})();