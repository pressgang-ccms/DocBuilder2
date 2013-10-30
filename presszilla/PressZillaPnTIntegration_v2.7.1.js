/*
    This file contains the logic for searching the KBase for solutions based on the keywords in a topic.
 */
(function() {
    if (isDocbuilderWindow()) {

        var solutionsCache = {};

        function addClickFunction(buttonId, topicId, popoverId) {
            jQuery('#' + buttonId).click(function() {
                jQuery('#' + buttonId).attr('disabled', 'true');
                jQuery('#' + buttonId).text('Getting Content');
                jQuery('#' + buttonId).removeClass('btn-primary');
                jQuery('#' + buttonId).removeClass('btn-danger');
                jQuery('#' + buttonId).addClass('btn-primary');

                fetchKeywords(topicId, function(topic) {
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
            if (!solutionsCache[topicId].fetchingSolutions) {

                solutionsCache[topicId].fetchingSolutions = true;

                var keywords = "";
                for (var keywordIndex = 0, keywordCount = topic.keywords.length; keywordIndex < keywordCount; ++keywordIndex){
                    if (keywords.length != 0) {
                        keywords += " ";
                    }

                    // http://lucene.apache.org/core/2_9_4/queryparsersyntax.html#Boosting a Term
                    keywords += topic.keywords[keywordIndex] + "^" + (keywordCount - keywordIndex);
                }

                logToConsole("Querying solutions: " + keywords);

                var url = "https://engineering.redhat.com/alfresco/service/cmis/query?q=SELECT%20cmis%3Aname%20FROM%20cmis%3Adocument%20WHERE%20CONTAINS(%27" + encodeURIComponent(keywords) + "%27)";

                logToConsole(url);

                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
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
                                logToConsole("401 returned");

                                solutionsCache[topicId].fetchingSolutions = false;

                                var buttonId = popoverId + 'contentbutton';

                                content.append(jQuery('<p>If you are running Chrome, you will need to log into, or log out of and log back into, the <a href="http://access.redhat.com">Red Hat Customer Portal</a>.</p>\
                                        <p>If you are running Firefox, then the credentials you entered were incorrect. Please confirm that the username and password you entered are valid for the <a href="http://access.redhat.com">Red Hat Customer Portal</a>.</p>\
                                        <div style="display:table-cell; text-align: center; vertical-align:middle; width: 746px;">\
                                            <button id="' + buttonId + '" style="margin-top: 32px;" type="button" class="btn btn-danger">Try Again</button>\
                                        </div>'));

                                addClickFunction(buttonId, topicId, popoverId);
                            } else if (solutionsResponse.status == 200) {
                                logToConsole("200 returned");

                                var xmlDoc = jQuery.parseXML( solutionsResponse.responseText );
                                var xml = jQuery( xmlDoc );
                                var entries = jQuery(xml).find('entry');

                                if (entries.length == 0) {
                                    logToConsole("Empty results returned");

                                    content.append(jQuery('<p>No content were found</p>'));
                                } else {
                                    var solutionsTable = "<ul>";

                                    entries.each(function(index, value) {
                                        var title = value.find('title');
                                        var content = value.find('content');
                                        solutionsTable += '<li><a href="' + title + '">' + content.attr('src') + '</a></li>';
                                    });


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
                logToConsole("Already searching for content");
            }
        }

        // listen for the kcs popover
        jQuery(window).bind("pnt_opened", function(event){
            if (!solutionsCache[unsafeWindow.eventDetails.topicId]) {

                solutionsCache[unsafeWindow.eventDetails.topicId] = {contentFixed: true};

                var content = jQuery('#' + unsafeWindow.eventDetails.popoverId + "content");
                content.empty();

                var buttonId = unsafeWindow.eventDetails.popoverId + 'contentbutton';

                content.append(jQuery('<p>This popover displays PnT content that match the keywords in the topic.</p>\
                        <p>If you are running Chrome, you first need to log into into the <a href="https://engineering.redhat.com/pnt">PNT Portal</a>.</p>\
                        <p>If you are running Firefox, you may be prompted for a username and password. These credentials are the ones that you use to log into the <a href="https://engineering.redhat.com/pnt">PNT Portal</a></p>\
                        <div style="display:table-cell; text-align: center; vertical-align:middle; width: 746px;">\
                            <button id="' + buttonId + '" style="margin-top: 32px;" type="button" class="btn btn-primary">Get Content</button>\
                        </div>'));

                addClickFunction(buttonId, unsafeWindow.eventDetails.topicId, unsafeWindow.eventDetails.popoverId);
            }
        });
    }
})();