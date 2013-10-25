/*
 This file contains the logic for searching the KBase for solutions based on the keywords in a topic.
 */
(function() {
    if (isDocbuilderWindow()) {

        var mojoCache = {};

        function addClickFunction(buttonId, topicId, popoverId) {
            jQuery('#' + buttonId).click(function() {
                jQuery('#' + buttonId).attr('disabled', 'true');
                jQuery('#' + buttonId).text('Getting Documents');
                jQuery('#' + buttonId).removeClass('btn-primary');
                jQuery('#' + buttonId).removeClass('btn-danger');
                jQuery('#' + buttonId).addClass('btn-primary');
                fetchKeywords(topicId, function(topic){
                    getSolutions(topic, 100, topicId, popoverId, false);
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
        function getSolutions(topic, position, topicId, popoverId, resend) {
            if (!mojoCache[topicId].fetchingDocuments || resend) {

                mojoCache[topicId].fetchingDocuments = true;

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

                var kcsUrl = "https://mojo.redhat.com/api/core/v3/search/contents?filter=search(" + encodeURIComponent(keywords) + ")";

                GM_xmlhttpRequest({
                    method: 'GET',
                    url: kcsUrl,
                    headers: {Accept: 'application/json'},
                    onabort: function() {logToConsole("onabort"); handleError(popoverId);},
                    onerror: function() {logToConsole("onerror"); handleError(popoverId);},
                    onprogress: function() {logToConsole("onprogress");},
                    onreadystatechange: function() {logToConsole("onreadystatechange");},
                    ontimeout: function() {logToConsole("ontimeout"); handleError(popoverId);},
                    onload: function(solutionsResponse) {
                        logToConsole(solutionsResponse);



                        if (solutionsResponse.status == 401) {

                            mojoCache[topicId].fetchingDocuments = false;

                            var buttonId = popoverId + 'contentbutton';

                            var content = jQuery('#' + popoverId + "content");
                            content.empty();

                            content.append(jQuery('<p>You need to be logged into <a href="http://mojo.redhat.com">Mojo</a> for this menu to work.</p>\
                                    <div style="display:table-cell; text-align: center; vertical-align:middle; width: 746px;">\
                                        <button id="' + buttonId + '" style="margin-top: 32px;" type="button" class="btn btn-danger">Try Again</button>\
                                    </div>'));

                            addClickFunction(buttonId, topicId, popoverId);
                        } else if (solutionsResponse.status == 200) {
                            //https://developers.jivesoftware.com/community/message/5127#5127
                            var documents = JSON.parse(solutionsResponse.responseText.replace(/^throw [^;]*;/, ''));
                            if (documents.list.length == 0) {
                                logToConsole("Empty results returned");

                                if (position > 0) {
                                    logToConsole("Searching with fewer mandatory keywords");
                                    getSolutions(topic, position - 25, topicId, popoverId, true);
                                } else {
                                    var content = jQuery('#' + popoverId + "content");
                                    content.empty();

                                    content.append(jQuery('<p>No results found.</p>'));
                                }
                            } else {
                                var documentsTable = "<ul>";

                                for (var documentIndex = 0, documentCount = documents.list.length; documentIndex < documentCount; ++documentIndex) {
                                    var document = documents.list[documentIndex];
                                    if (document.type == "document") {
                                        var views = '(' + document.viewCount  + (document.viewCount == 1 ? ' view' : ' views') + ')';
                                        documentsTable += '<li><a href="' + document.resources.html.ref + '">' + document.subject + ' - ' + document.author.name.givenName + ' ' + document.author.name.familyName + ' ' + views + '</a></li>';
                                    }
                                }

                                documentsTable += "</ul>";

                                // keep a copy of the results
                                mojoCache[topicId].text = documentsTable;

                                var content = jQuery('#' + popoverId + "content");
                                content.empty();

                                content.append(jQuery(documentsTable));
                            }

                        }
                    }
                });
            }
        }

        // listen for the kcs popover
        jQuery(window).bind("mojo_opened", function(event){
            if (!mojoCache[unsafeWindow.eventDetails.topicId]) {

                mojoCache[unsafeWindow.eventDetails.topicId] = {contentFixed: true};

                var content = jQuery('#' + unsafeWindow.eventDetails.popoverId + "content");
                content.empty();

                var buttonId = unsafeWindow.eventDetails.popoverId + 'contentbutton';

                content.append(jQuery('<p>This popover displays Mojo documents that match the keywords in the topic.</p>\
                        <p>To use this menu you first need to log into into <a href="http://mojo.redhat.com">Mojo</a>.</p>\
                        <div style="display:table-cell; text-align: center; vertical-align:middle; width: 746px;">\
                            <button id="' + buttonId + '" style="margin-top: 32px;" type="button" class="btn btn-primary">Get Documents</button>\
                        </div>'));

                addClickFunction(buttonId, unsafeWindow.eventDetails.topicId, unsafeWindow.eventDetails.popoverId);
            }
        });
    }
})();