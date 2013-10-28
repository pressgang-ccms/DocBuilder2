/*
    Hooks into the Bugzilla JSONRPC API to get the status of any bugs relating to the spec.
*/

(function() {

    logToConsole("Searching Bugzilla");

    function handleFailure(message) {

    }

    var specId = unsafeWindow.getSpecIdFromURL();
    var specProductUrl = "http://topika.ecs.eng.bne.redhat.com:8080/pressgang-ccms/rest/1/contentspecnodes/get/json/query;csNodeType=7;contentSpecIds=" + specId + "?expand=" + encodeURIComponent("{\"branches\":[{\"trunk\":{\"name\": \"nodes\"}}]}");
    var bugzillaBaseUrl = "https://bugzilla.redhat.com/"
    var bugzillaApiUrl = bugzillaBaseUrl + "jsonrpc.cgi";

    setTimeout(function() {
        GM_xmlhttpRequest({
            method: 'GET',
            url: specProductUrl,
            onabort: function() {handleFailure("onabort"); },
            onerror: function() {handleFailure("onerror");},
            ontimeout: function() {handleFailure("ontimeout");},
            onload: function(specNodesResponse) {

                logToConsole("Got spec nodes");

                var nodes = JSON.parse(specNodesResponse.responseText);
                var bzProduct = "";
                var bzComponent = "";
                var bzVersion = "";
                for (var nodeIndex = 0, nodeCount = nodes.items.length; nodeIndex < nodeCount; ++nodeIndex) {
                    var node = nodes.items[nodeIndex].item;
                    if (node.title == "BZProduct") {
                        bzProduct = node.additionalText;
                    } else if (node.title == "BZComponent") {
                        bzComponent = node.additionalText;
                    }  else if (node.title == "BZVersion") {
                        bzVersion = node.additionalText;
                    }
                }

                if (bzProduct == "") {
                    logToConsole("No Bugzilla details specified in spec");
                } else {
                    var data = '{"method":"Bug.search","params":[{';
                    var params = "";

                    if (bzProduct != "") {
                        params += '"product": "' + bzProduct + '"';
                    }

                    if (bzComponent != "") {
                        if (params.length != 0) {
                            params += ",";
                        }
                        params += '"component": "' + bzComponent + '"';
                    }

                    if (bzVersion != "") {
                        if (params.length != 0) {
                            params += ",";
                        }
                        params += '"version": "' + bzVersion + '"';
                    }

                    data += params + '}], "id":1}';

                    GM_xmlhttpRequest({
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        url: bugzillaApiUrl,
                        data: data,
                        onabort: function() {handleFailure("onabort"); },
                        onerror: function() {handleFailure("onerror");},
                        ontimeout: function() {handleFailure("ontimeout");},
                        onload: function(response) {

                            logToConsole("Got Bugzilla bugs");
                            logToConsole(response);

                            jQuery('#newBugzillaBugsPlaceholder').remove();
                            jQuery('#assignedBugzillaBugsPlaceholder').remove();
                            jQuery('#modifiedBugzillaBugsPlaceholder').remove();
                            jQuery('#postBugzillaBugsPlaceholder').remove();
                            jQuery('#onqaBugzillaBugsPlaceholder').remove();
                            jQuery('#verifiedBugzillaBugsPlaceholder').remove();
                            jQuery('#releasePendingBugzillaBugsPlaceholder').remove();
                            jQuery('#closedBugzillaBugsPlaceholder').remove();

                            var responseJson = JSON.parse(response.responseText);
                            var bugs = responseJson.result.bugs;

                            var newCount = 0, assignedCount = 0, modifiedCount = 0, onqaCount = 0, verifiedCount = 0, closedCount = 0, postCount = 0, releasePendingCount = 0;

                            for (var bugIndex = 0, bugCount = bugs.length; bugIndex < bugCount; ++bugIndex) {
                                var bug = bugs[bugIndex];

                                /*
                                    Find the topic id from the environment field
                                 */
                                var topicId = null;

                                var matches = /Topic ID: (\d+)/.exec(bug.cd_environment);

                                if (matches) {
                                    topicId = matches[1];
                                }

                                if (bug.status == "NEW") {
                                    ++newCount;
                                    var link = '<div class="btn-group">\
                                        <button type="button" class="btn btn-danger">' + bug.summary + '</button>\
                                        <button type="button" class="btn btn-danger dropdown-toggle" data-toggle="dropdown">\
                                            <span class="caret"></span>\
                                        </button>\
                                        <ul class="dropdown-menu" role="menu">\
                                            <li><a href="' + bugzillaBaseUrl + "show_bug.cgi?id=" + bug.id + '">Open in Bugzilla</a></li>';

                                    if (topicId) {
                                        link += '<li><a href="javascript:topicSections[' + topicId + '].scrollIntoView()">View Topic</a></li>'
                                    }
                                    link += '</ul>\
                                    </div>';
                                    var link = '<li><a href="' + bugzillaBaseUrl + "show_bug.cgi?id=" + bug.id + '">' + bug.summary + '</a></li>';
                                    jQuery('#newBugzillaBugsItems').append(jQuery(link));
                                } else if (bug.status == "ASSIGNED") {
                                    ++assignedCount;
                                    var link = '<li><a href="' + bugzillaBaseUrl + "show_bug.cgi?id=" + bug.id + '">' + bug.summary + '</a></li>';
                                    jQuery('#assignedBugzillaBugsItems').append(jQuery(link));
                                } else if (bug.status == "POST") {
                                    ++postCount;
                                    var link = '<li><a href="' + bugzillaBaseUrl + "show_bug.cgi?id=" + bug.id + '">' + bug.summary + '</a></li>';
                                    jQuery('#postBugzillaBugsItems').append(jQuery(link));
                                } else if (bug.status == "MODIFIED") {
                                    ++modifiedCount;
                                    var link = '<li><a href="' + bugzillaBaseUrl + "show_bug.cgi?id=" + bug.id + '">' + bug.summary + '</a></li>';
                                    jQuery('#modifiedBugzillaBugsItems').append(jQuery(link));
                                } else if (bug.status == "ON_QA") {
                                    ++onqaCount;
                                    var link = '<li><a href="' + bugzillaBaseUrl + "show_bug.cgi?id=" + bug.id + '">' + bug.summary + '</a></li>';
                                    jQuery('#onqaBugzillaBugsItems').append(jQuery(link));
                                } else if (bug.status == "VERIFIED") {
                                    ++verifiedCount;
                                    var link = '<li><a href="' + bugzillaBaseUrl + "show_bug.cgi?id=" + bug.id + '">' + bug.summary + '</a></li>';
                                    jQuery('#verifiedBugzillaBugsItems').append(jQuery(link));
                                } else if (bug.status == "CLOSED") {
                                    ++closedCount;
                                    var link = '<li><a href="' + bugzillaBaseUrl + "show_bug.cgi?id=" + bug.id + '">' + bug.summary + '</a></li>';
                                    jQuery('#closedBugzillaBugsItems').append(jQuery(link));
                                } else if (bug.status == "RELEASE_PENDING") {
                                    ++releasePendingCount;
                                    var link = '<li><a href="' + bugzillaBaseUrl + "show_bug.cgi?id=" + bug.id + '">' + bug.summary + '</a></li>';
                                    jQuery('#releasePendingBugzillaBugsItems').append(jQuery(link));
                                }

                            }

                            $('#newBugzillaBugs').append($('<span class="badge pull-right">' + newCount + '</span>'));
                            $('#assignedBugzillaBugs').append($('<span class="badge pull-right">' + assignedCount + '</span>'));
                            $('#postBugzillaBugs').append($('<span class="badge pull-right">' + postCount + '</span>'));
                            $('#modifiedBugzillaBugs').append($('<span class="badge pull-right">' + modifiedCount + '</span>'));
                            $('#onqaBugzillaBugs').append($('<span class="badge pull-right">' + onqaCount + '</span>'));
                            $('#verifiedBugzillaBugs').append($('<span class="badge pull-right">' + verifiedCount + '</span>'));
                            $('#closedBugzillaBugs').append($('<span class="badge pull-right">' + closedCount + '</span>'));
                            $('#releasePendingBugzillaBugs').append($('<span class="badge pull-right">' + releasePendingCount + '</span>'));

                            /*
                                Build a pie chart without the closed bugs
                             */

                            var withoutClosedLabels = ["New", "Assigned", "Post", "Modified", "On QA", "Verified", "Release Pending"];

                            var withoutClosedColors = [unsafeWindow.Raphael.rgb(255, 0, 0),
                                unsafeWindow.Raphael.rgb(255, 153, 102),
                                unsafeWindow.Raphael.rgb(102, 255, 102),
                                unsafeWindow.Raphael.rgb(0, 204, 153),
                                unsafeWindow.Raphael.rgb(0, 102, 255),
                                unsafeWindow.Raphael.rgb(255,102,255),
                                unsafeWindow.Raphael.rgb(102, 0, 102)];

                            var withoutClosedValues = [newCount,
                                assignedCount,
                                postCount,
                                modifiedCount,
                                onqaCount,
                                verifiedCount,
                                releasePendingCount];


                            var withoutCloseOffscreenDiv = jQuery('<div id="bugzillaBugsWithoutClosedChart"></div>');
                            withoutCloseOffscreenDiv.appendTo(jQuery('#offscreenRendering'));

                            setTimeout(function(offscreenDiv, values, labels, colors) {
                                return function(){
                                    unsafeWindow.Raphael("bugzillaBugsWithoutClosedChart", 250, 250).pieChart(125, 125, 50, values, labels, colors, 30, 30, 16, "#fff");
                                    withoutCloseOffscreenDiv.appendTo(jQuery("#bugzillaBugsPanel"));
                                }
                            }(withoutCloseOffscreenDiv, withoutClosedValues, withoutClosedLabels, withoutClosedColors), 0);

                            /*
                                Build a pie chart with the closed bugs
                             */

                            var labels = ["New", "Assigned", "Post", "Modified", "On QA", "Verified", "Closed", "Release Pending"];

                            var colors = [unsafeWindow.Raphael.rgb(255, 0, 0),
                                unsafeWindow.Raphael.rgb(255, 153, 102),
                                unsafeWindow.Raphael.rgb(102, 255, 102),
                                unsafeWindow.Raphael.rgb(0, 204, 153),
                                unsafeWindow.Raphael.rgb(0, 102, 255),
                                unsafeWindow.Raphael.rgb(255,102,255),
                                unsafeWindow.Raphael.rgb(0, 0, 0),
                                unsafeWindow.Raphael.rgb(102, 0, 102)];

                            var values = [newCount,
                                assignedCount,
                                postCount,
                                modifiedCount,
                                onqaCount,
                                verifiedCount,
                                closedCount,
                                releasePendingCount];


                            var offscreenDiv = jQuery('<div id="bugzillaBugsChart"></div>');
                            offscreenDiv.appendTo(jQuery('#offscreenRendering'));

                            setTimeout(function(offscreenDiv, values, labels, colors) {
                                return function(){
                                    unsafeWindow.Raphael("bugzillaBugsChart", 250, 250).pieChart(125, 125, 50, values, labels, colors, 30, 30, 16, "#fff");
                                    offscreenDiv.appendTo(jQuery("#bugzillaBugsPanel"));
                                }
                            }(offscreenDiv, values, labels, colors), 0);
                        }
                    });
                }

            }
        });
    }, 0);

})();