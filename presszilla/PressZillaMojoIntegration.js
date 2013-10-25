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
                    getSolutions(topic, 100, topicId, popoverId);
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
         * @param position How many of the keywords, in percent, will be ANDed in the query. 100 means all keywords are ANDed.
         *                 30 means that the top 30% of the keywords are ANDed, and bottom 70% are ORed
         * @param topicId The topic id
         * @param popoverId The popover id
         */
        function getSolutions(topic, position, topicId, popoverId) {
            if (!mojoCache[topicId].fetchingDocuments) {

                mojoCache[topicId].fetchingDocuments = true;

                var keywords = "";
                for (var keywordIndex = 0, keywordCount = topic.keywords.length; keywordIndex < keywordCount; ++keywordIndex){
                    if (keywords.length != 0) {
                            keywords += ",";
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

                        var content = jQuery('#' + popoverId + "content");
                        content.empty();

                        if (solutionsResponse.status == 401) {

                            mojoCache[topicId].fetchingDocuments = false;

                            var buttonId = popoverId + 'contentbutton';

                            content.append(jQuery('<p>If you are running Chrome, you will need to log into, or log out of and log back into, the <a href="http://access.redhat.com">Red Hat Customer Portal</a>.</p>\
                                    <p>If you are running Firefox, then the credentials you entered were incorrect. Please confirm that the username and password you entered are valid for the <a href="http://access.redhat.com">Red Hat Customer Portal</a>.</p>\
                                    <div style="display:table-cell; text-align: center; vertical-align:middle; width: 746px;">\
                                        <button id="' + buttonId + '" style="margin-top: 32px;" type="button" class="btn btn-danger">Try Again</button>\
                                    </div>'));

                            addClickFunction(buttonId, topicId, popoverId);
                        } else if (solutionsResponse.status == 200) {
                            var documents = JSON.parse(solutionsResponse.responseText);

                            var documentsTable = "<ul>";

                            for (var documentIndex = 0, documentCount = solutions.list.length; documentIndex < documentCount; ++documentIndex) {
                                var document = solutions.list[documentIndex];
                                if (document.type == "document") {
                                    documentsTable += '<li><a href="' + document.resources.html + '">' + document.subject + '</a></li>';
                                }
                            }

                            documentsTable += "</ul>";

                            // keep a copy of the results
                            mojoCache[topicId].text = documentsTable;

                            content.append(jQuery(documentsTable));

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
                        <p>If you are running Chrome, you first need to log into into <a href="http://mojo.redhat.com">Mojo</a>.</p>\
                        <p>If you are running Firefox, you may be prompted for a username and password. These credentials are the ones that you use to log into <a href="http://mojo.redhat.com">Mojo</a>.</p>\
                        <div style="display:table-cell; text-align: center; vertical-align:middle; width: 746px;">\
                            <button id="' + buttonId + '" style="margin-top: 32px;" type="button" class="btn btn-primary">Get Documents</button>\
                        </div>'));

                addClickFunction(buttonId, unsafeWindow.eventDetails.topicId, unsafeWindow.eventDetails.popoverId);
            }
        });
    }
})();