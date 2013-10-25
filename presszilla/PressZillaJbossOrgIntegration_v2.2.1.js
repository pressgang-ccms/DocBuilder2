/*
 This file contains the logic for searching the jboss.org website based on the keywords in a topic.
 */
(function() {
    if (isDocbuilderWindow()) {

        var cache = {};

        function addClickFunction(buttonId, topicId, popoverId) {
            jQuery('#' + buttonId).click(function() {
                jQuery('#' + buttonId).attr('disabled', 'true');
                jQuery('#' + buttonId).text('Getting Content');
                jQuery('#' + buttonId).removeClass('btn-primary');
                jQuery('#' + buttonId).removeClass('btn-danger');
                jQuery('#' + buttonId).addClass('btn-primary');
                fetchKeywords(topicId, function(topic){
                    getSolutions(topic, topicId, popoverId);
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
        function getSolutions(topic, topicId, popoverId) {
            if (!cache[topicId].fetchingDocuments) {

                cache[topicId].fetchingDocuments = true;

                var keywords = "";
                for (var keywordIndex = 0, keywordCount = topic.keywords.length; keywordIndex < keywordCount; ++keywordIndex){
                    if (keywords.length != 0) {
                            keywords += ",";
                    }
                    keywords += topic.keywords[keywordIndex];
                }

                var kcsUrl = "https://community.jboss.org/api/core/v3/search/contents?filter=search(" + encodeURIComponent(keywords) + ")";

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

                        var content = jQuery('#' + popoverId + "content");
                        content.empty();

                        if (solutionsResponse.status == 401) {

                            cache[topicId].fetchingDocuments = false;

                            var buttonId = popoverId + 'contentbutton';

                            content.append(jQuery('<p>You need to be logged into <a href="http://community.jboss.org">Jboss.org</a> for this menu to work.</p>\
                                    <div style="display:table-cell; text-align: center; vertical-align:middle; width: 746px;">\
                                        <button id="' + buttonId + '" style="margin-top: 32px;" type="button" class="btn btn-danger">Try Again</button>\
                                    </div>'));

                            addClickFunction(buttonId, topicId, popoverId);
                        } else if (solutionsResponse.status == 200) {
                            //https://developers.jivesoftware.com/community/message/5127#5127
                            var documents = JSON.parse(solutionsResponse.responseText.replace(/^throw [^;]*;/, ''));

                            var documentsTable = "<ul>";

                            for (var documentIndex = 0, documentCount = documents.list.length; documentIndex < documentCount; ++documentIndex) {
                                var document = documents.list[documentIndex];
                                if (document.type == "document" || document.type == "message") {
                                    var views = '(' + document.viewCount  + (document.viewCount == 1 ? ' view' : ' views') + ')';
                                    documentsTable += '<li><a href="' + document.resources.html.ref + '">' + document.subject + ' - ' + document.author.name.givenName + ' ' + document.author.name.familyName + ' ' + views + '</a></li>';
                                }
                            }

                            documentsTable += "</ul>";

                            // keep a copy of the results
                            cache[topicId].text = documentsTable;

                            content.append(jQuery(documentsTable));

                        }
                    }
                });
            }
        }

        // listen for the kcs popover
        jQuery(window).bind("jboss_opened", function(event){
            if (!cache[unsafeWindow.eventDetails.topicId]) {

                cache[unsafeWindow.eventDetails.topicId] = {contentFixed: true};

                var content = jQuery('#' + unsafeWindow.eventDetails.popoverId + "content");
                content.empty();

                var buttonId = unsafeWindow.eventDetails.popoverId + 'contentbutton';

                content.append(jQuery('<p>This popover displays jboss.org documents that match the keywords in the topic.</p>\
                        <p>To use this menu you first need to log into into <a href="http://community.jboss.org">Jboss.org</a>.</p>\
                        <div style="display:table-cell; text-align: center; vertical-align:middle; width: 746px;">\
                            <button id="' + buttonId + '" style="margin-top: 32px;" type="button" class="btn btn-primary">Get Content</button>\
                        </div>'));

                addClickFunction(buttonId, unsafeWindow.eventDetails.topicId, unsafeWindow.eventDetails.popoverId);
            }
        });
    }
})();