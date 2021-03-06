/*
    This file contains the logic for searching the KBase for solutions based on the keywords in a topic.
 */
(function() {
    if (isDocbuilderWindow()) {

        var solutionsCache = {};

        function addClickFunction(buttonId, topicId, popoverId) {
            jQuery('#' + buttonId).click(function() {
                jQuery('#' + buttonId).attr('disabled', 'true');
                jQuery('#' + buttonId).text('Getting Solutions');
                jQuery('#' + buttonId).removeClass('btn-primary');
                jQuery('#' + buttonId).removeClass('btn-danger');
                jQuery('#' + buttonId).addClass('btn-primary');

                fetchKeywords(topicId, function(topic) {
                    getSolutions(topic, topicId, popoverId, false);
                }, function () {
                    handleError(popoverId);
                });
            });
        }

        function handleError(popoverId) {
            var buttonId = popoverId + 'contentbutton';
            jQuery('#' + buttonId).attr('disabled', 'true');
            jQuery('#' + buttonId).text('Connection Failed');
            jQuery('#' + buttonId).removeClass('btn-primary');
            jQuery('#' + buttonId).addClass('btn-danger');
        }

        /**
         * Query the KBase for solutions.
         * @param topic The topic with an expanded set of keywords
         * @param topicId The topic id
         * @param popoverId The popover id
         */
        function getSolutions(topic, topicId, popoverId, recall) {
            if (!solutionsCache[topicId].fetchingSolutions || recall) {

                solutionsCache[topicId].fetchingSolutions = true;

                var keywords = "";
                for (var keywordIndex = 0, keywordCount = topic.keywords.length; keywordIndex < keywordCount; ++keywordIndex){
                    if (keywords.length != 0) {
                        keywords += " OR ";
                    }

                    // http://lucene.apache.org/core/2_9_4/queryparsersyntax.html#Boosting a Term
                    keywords += topic.keywords[keywordIndex] + "^" + (keywordCount - keywordIndex);
                }

                logToConsole("Querying solutions: " + keywords);

                var kcsUrl = "https://api.access.redhat.com/rs/solutions?limit=10&keyword=" + encodeURIComponent(keywords);

                GM_xmlhttpRequest({
                    method: 'GET',
                    url: kcsUrl,
                    headers: {Accept: 'application/json'},
                    onabort: function() {logToConsole("onabort"); handleError(popoverId);},
                    onerror: function() {logToConsole("onerror"); handleError(popoverId);},
                    onprogress: function() {logToConsole("onprogress");},
                    onreadystatechange: function() {logToConsole("onreadystatechange");},
                    ontimeout: function() {logToConsole("ontimeout"); handleError(popoverId);},
                    onload: function(topicId, popoverId) {
                        return function(solutionsResponse) {
                            logToConsole(solutionsResponse);

                            var content = jQuery('#' + popoverId + "content");
                            content.empty();

                            if (solutionsResponse.status == 401) {

                                solutionsCache[topicId].fetchingSolutions = false;

                                var buttonId = popoverId + 'contentbutton';

                                content.append(jQuery('<p>If you are running Chrome, you will need to log into, or log out of and log back into, the <a href="http://access.redhat.com">Red Hat Customer Portal</a>.</p>\
                                        <p>If you are running Firefox, then the credentials you entered were incorrect. Please confirm that the username and password you entered are valid for the <a href="http://access.redhat.com">Red Hat Customer Portal</a>.</p>\
                                        <div style="display:table-cell; text-align: center; vertical-align:middle; width: 746px;">\
                                            <button id="' + buttonId + '" style="margin-top: 32px;" type="button" class="btn btn-danger">Try Again</button>\
                                        </div>'));

                                addClickFunction(buttonId, topicId, popoverId);
                            } else if (solutionsResponse.status == 200) {
                                logToConsole("Result returned");

                                var solutions = JSON.parse(solutionsResponse.responseText);

                                if (!solutions.solution) {
                                    logToConsole("Empty results returned");

                                     content.append(jQuery('<p>No solutions were found</p>'));
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
            } else {
                logToConsole("Already searching for solutions");
            }
        }

        // listen for the kcs popover
        jQuery(window).bind("solutions_opened", function(event){
            if (!solutionsCache[unsafeWindow.eventDetails.topicId]) {

                solutionsCache[unsafeWindow.eventDetails.topicId] = {contentFixed: true};

                var content = jQuery('#' + unsafeWindow.eventDetails.popoverId + "content");
                content.empty();

                var buttonId = unsafeWindow.eventDetails.popoverId + 'contentbutton';

                content.append(jQuery('<p>This popover displays KCS solutions that match the keywords in the topic.</p>\
                        <p>If you are running Chrome, you first need to log into into the <a href="http://access.redhat.com">Red Hat Customer Portal</a>.</p>\
                        <p>If you are running Firefox, you may be prompted for a username and password. These credentials are the ones that you use to log into the <a href="http://access.redhat.com">Red Hat Customer Portal</a></p>\
                        <div style="display:table-cell; text-align: center; vertical-align:middle; width: 746px;">\
                            <button id="' + buttonId + '" style="margin-top: 32px;" type="button" class="btn btn-primary">Get Solutions</button>\
                        </div>'));

                addClickFunction(buttonId, unsafeWindow.eventDetails.topicId, unsafeWindow.eventDetails.popoverId);
            }
        });
    }
})();